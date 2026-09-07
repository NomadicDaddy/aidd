import { afterEach, describe, expect, test } from 'bun:test';
import { mkdir, utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
	type AuditReportMetadata,
	clearGitHistoryCache,
	createAuditFreshnessContext,
	evaluateAuditReportFreshness,
	prependAuditReportMetadata,
} from 'aidd-shared/metadata/audit-freshness';

import { testTempRoot } from '../_helpers/temp.ts';
import { removeTempTree } from '../../shared/src/lib/remove-temp-tree.ts';

const rootDir = join(testTempRoot, 'aidd-audit-freshness');
const now = new Date('2026-05-24T12:00:00.000Z');
const gitHistoryTestTimeoutMs = 30_000;

afterEach(async () => {
	await removeTempTree(rootDir);
});

describe('audit report freshness', () => {
	test('returns missing when no matching report exists', async () => {
		const projectDir = join(rootDir, 'missing');
		await mkdir(projectDir, { recursive: true });

		const freshness = await evaluateAuditReportFreshness(projectDir, 'SECURITY', { now });

		expect(freshness.status).toBe('missing');
		expect(freshness.report).toBeNull();
	});

	test('keeps a recent report fresh with low code churn', async () => {
		const projectDir = await initGitProject('fresh-low-churn');
		const base = await gitOutput(projectDir, ['rev-parse', 'HEAD']);
		await writeAuditReport(projectDir, 'SECURITY', metadata(base.trim(), now));
		await commitSourceFile(projectDir, 'src/one.ts', 'export const one = 1;\n');

		const freshness = await evaluateAuditReportFreshness(projectDir, 'SECURITY', { now });

		expect(freshness.status).toBe('fresh');
		expect(freshness.gitInspected).toBe(true);
		expect(freshness.changes).toEqual({
			codeCommits: 1,
			sourceFiles: 1,
			sourceLines: 1,
		});
	});

	test('marks an old report stale by age', async () => {
		const projectDir = join(rootDir, 'old-report');
		await writeAuditReport(
			projectDir,
			'SECURITY',
			null,
			'# SECURITY\n',
			'2026-04-01T00:00:00.000Z',
		);

		const freshness = await evaluateAuditReportFreshness(projectDir, 'SECURITY', { now });

		expect(freshness.status).toBe('stale');
		expect(freshness.staleReasons).toEqual(['age']);
		expect(freshness.gitInspected).toBe(false);
	});

	test(
		'marks a recent report stale after 10 source commits',
		async () => {
			const projectDir = await initGitProject('commit-threshold');
			const base = await gitOutput(projectDir, ['rev-parse', 'HEAD']);
			await writeAuditReport(projectDir, 'SECURITY', metadata(base.trim(), now));
			for (let index = 0; index < 10; index++) {
				await commitSourceFile(
					projectDir,
					`src/file-${index}.ts`,
					`export const value${index} = ${index};\n`,
				);
			}

			const freshness = await evaluateAuditReportFreshness(projectDir, 'SECURITY', { now });

			expect(freshness.status).toBe('stale');
			expect(freshness.staleReasons).toContain('code_commits');
			expect(freshness.changes?.codeCommits).toBe(10);
		},
		gitHistoryTestTimeoutMs,
	);

	test('marks a recent report stale after 25 touched source files', async () => {
		const projectDir = await initGitProject('file-threshold');
		const base = await gitOutput(projectDir, ['rev-parse', 'HEAD']);
		await writeAuditReport(projectDir, 'SECURITY', metadata(base.trim(), now));
		for (let index = 0; index < 25; index++) {
			await writeFile(
				join(projectDir, 'src', `bulk-${index}.ts`),
				`export const bulk${index} = ${index};\n`,
			);
		}
		await runGit(projectDir, ['add', 'src']);
		await runGit(projectDir, ['commit', '-m', 'feat: touch files']);

		const freshness = await evaluateAuditReportFreshness(projectDir, 'SECURITY', { now });

		expect(freshness.status).toBe('stale');
		expect(freshness.staleReasons).toContain('source_files');
		expect(freshness.changes?.sourceFiles).toBe(25);
	});

	test('marks a recent report stale after 750 changed source lines', async () => {
		const projectDir = await initGitProject('line-threshold');
		const base = await gitOutput(projectDir, ['rev-parse', 'HEAD']);
		await writeAuditReport(projectDir, 'SECURITY', metadata(base.trim(), now));
		const lines = Array.from(
			{ length: 750 },
			(_, index) => `export const line${index} = ${index};`,
		);
		await commitSourceFile(projectDir, 'src/big.ts', `${lines.join('\n')}\n`);

		const freshness = await evaluateAuditReportFreshness(projectDir, 'SECURITY', { now });

		expect(freshness.status).toBe('stale');
		expect(freshness.staleReasons).toContain('source_lines');
		expect(freshness.changes?.sourceLines).toBe(750);
	});

	test('falls back to age-only freshness outside git worktrees', async () => {
		const projectDir = join(rootDir, 'not-git');
		await writeAuditReport(projectDir, 'SECURITY', null);

		const freshness = await evaluateAuditReportFreshness(projectDir, 'SECURITY', { now });

		expect(freshness.status).toBe('fresh');
		expect(freshness.gitInspected).toBe(false);
		expect(freshness.changes).toBeNull();
	});

	test(
		'uses report metadata head instead of report mtime for code-change baseline',
		async () => {
			const projectDir = await initGitProject('metadata-head');
			const base = await gitOutput(projectDir, ['rev-parse', 'HEAD']);
			for (let index = 0; index < 10; index++) {
				await commitSourceFile(
					projectDir,
					`src/pre-report-${index}.ts`,
					`export const preReport${index} = ${index};\n`,
				);
			}
			await writeAuditReport(projectDir, 'SECURITY', metadata(base.trim(), now));

			const freshness = await evaluateAuditReportFreshness(projectDir, 'SECURITY', { now });

			expect(freshness.status).toBe('stale');
			expect(freshness.staleReasons).toContain('code_commits');
			expect(freshness.changes?.codeCommits).toBe(10);
		},
		gitHistoryTestTimeoutMs,
	);

	test('deduplicates concurrent git numstat inspection within a freshness context', async () => {
		const projectDir = await initGitProject('dedupe-git-log');
		const base = await gitOutput(projectDir, ['rev-parse', 'HEAD']);
		await writeAuditReport(projectDir, 'SECURITY', metadata(base.trim(), now));
		await commitSourceFile(projectDir, 'src/one.ts', 'export const one = 1;\n');
		const context = createAuditFreshnessContext();
		const spawnCounter = countGitNumstatSpawns();
		try {
			const [first, second] = await Promise.all([
				evaluateAuditReportFreshness(projectDir, 'SECURITY', { context, now }),
				evaluateAuditReportFreshness(projectDir, 'SECURITY', { context, now }),
			]);

			expect(spawnCounter.count()).toBe(1);
			expect(first.changes).toEqual(second.changes);
			expect(first.gitInspected).toBe(true);
		} finally {
			spawnCounter.restore();
		}
	});

	test('reuses git history across freshness contexts until HEAD moves', async () => {
		clearGitHistoryCache();
		const projectDir = await initGitProject('cross-context-cache');
		const base = await gitOutput(projectDir, ['rev-parse', 'HEAD']);
		await writeAuditReport(projectDir, 'SECURITY', metadata(base.trim(), now));
		await commitSourceFile(projectDir, 'src/one.ts', 'export const one = 1;\n');
		const spawnCounter = countGitNumstatSpawns();
		try {
			const first = await evaluateAuditReportFreshness(projectDir, 'SECURITY', {
				context: createAuditFreshnessContext(),
				now,
			});
			expect(spawnCounter.count()).toBe(1);
			expect(first.changes?.codeCommits).toBe(1);

			// A fresh context is a fresh request. The history is unchanged, so it is not re-read.
			const second = await evaluateAuditReportFreshness(projectDir, 'SECURITY', {
				context: createAuditFreshnessContext(),
				now,
			});
			expect(spawnCounter.count()).toBe(1);
			expect(second.changes).toEqual(first.changes);

			// Moving HEAD discards the cached history, so the next read sees the new commit.
			await commitSourceFile(projectDir, 'src/two.ts', 'export const two = 2;\n');
			const third = await evaluateAuditReportFreshness(projectDir, 'SECURITY', {
				context: createAuditFreshnessContext(),
				now,
			});
			expect(spawnCounter.count()).toBe(2);
			expect(third.changes?.codeCommits).toBe(2);
		} finally {
			spawnCounter.restore();
			clearGitHistoryCache();
		}
	});
});

function countGitNumstatSpawns(): { count(): number; restore(): void } {
	const originalSpawn = Bun.spawn;
	let count = 0;
	Bun.spawn = ((command: unknown, options?: unknown) => {
		if (Array.isArray(command) && command.includes('log') && command.includes('--numstat')) {
			count++;
		}
		return originalSpawn(command as never, options as never);
	}) as typeof Bun.spawn;
	return {
		count: () => count,
		restore: () => {
			Bun.spawn = originalSpawn;
		},
	};
}

async function initGitProject(name: string): Promise<string> {
	const projectDir = join(rootDir, name);
	await mkdir(join(projectDir, 'src'), { recursive: true });
	await runGit(projectDir, ['init']);
	await runGit(projectDir, ['config', 'user.email', 'aidd-test@example.invalid']);
	await runGit(projectDir, ['config', 'user.name', 'aidd Test']);
	await writeFile(join(projectDir, 'package.json'), '{"name":"test-project"}\n');
	await runGit(projectDir, ['add', 'package.json']);
	await runGit(projectDir, ['commit', '-m', 'chore: init']);
	return projectDir;
}

async function commitSourceFile(
	projectDir: string,
	relativePath: string,
	content: string,
): Promise<void> {
	const path = join(projectDir, relativePath);
	await mkdir(join(path, '..'), { recursive: true });
	await writeFile(path, content);
	await runGit(projectDir, ['add', relativePath]);
	await commitStagedChanges(projectDir, `feat: update ${relativePath}`);
}

async function writeAuditReport(
	projectDir: string,
	auditName: string,
	reportMetadata: AuditReportMetadata | null,
	content = '# SECURITY\n',
	mtimeIso?: string,
): Promise<void> {
	const reportsDir = join(projectDir, '.aidd', 'audit-reports');
	await mkdir(reportsDir, { recursive: true });
	const body = reportMetadata ? prependAuditReportMetadata(content, reportMetadata) : content;
	const path = join(reportsDir, `${auditName}-2026-05-24.md`);
	await writeFile(path, body.endsWith('\n') ? body : `${body}\n`);
	if (mtimeIso) {
		const mtime = new Date(mtimeIso);
		await utimes(path, mtime, mtime);
	}
}

function metadata(gitHead: string, timestamp: Date): AuditReportMetadata {
	return {
		generatedAt: timestamp.toISOString(),
		gitHead,
		version: 1,
	};
}

async function runGit(projectDir: string, args: string[]): Promise<void> {
	const proc = Bun.spawn(['git', '-C', projectDir, ...args], {
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if ((await proc.exited) === 0) return;
	const stderr = await new Response(proc.stderr).text();
	throw new Error(`git ${args.join(' ')} failed: ${stderr}`);
}

async function gitOutput(projectDir: string, args: string[]): Promise<string> {
	const proc = Bun.spawn(['git', '-C', projectDir, ...args], {
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if ((await proc.exited) !== 0) {
		const stderr = await new Response(proc.stderr).text();
		throw new Error(`git ${args.join(' ')} failed: ${stderr}`);
	}
	return await new Response(proc.stdout).text();
}

async function commitStagedChanges(projectDir: string, message: string): Promise<void> {
	const [tree, parent, headRef] = await Promise.all([
		gitOutput(projectDir, ['write-tree']),
		gitOutput(projectDir, ['rev-parse', 'HEAD']),
		gitOutput(projectDir, ['symbolic-ref', 'HEAD']),
	]);
	const commit = await gitOutput(projectDir, [
		'commit-tree',
		tree.trim(),
		'-p',
		parent.trim(),
		'-m',
		message,
	]);
	await runGit(projectDir, ['update-ref', headRef.trim(), commit.trim()]);
}
