import { afterEach, describe, expect, test } from 'bun:test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'aidd-shared/args/index';
import type { ResolvedConfig } from 'aidd-shared/config';
import { FileAiddStore } from 'aidd-shared/metadata/store';
import { auditNames } from '../../cli/src/modes/audit-selection.ts';
import type { ModeContext } from 'aidd-shared/modes/types';
import { resolveRunPlan } from '../../cli/src/plan/resolve.ts';

const rootDir = join(import.meta.dir, '..', '..', '.tmp-audit-selection');

const config: ResolvedConfig = {
	cli: 'native',
	dirtyTreeThreshold: 50,
	idleNudgeTimeoutSeconds: 600,
	idleTimeoutSeconds: 900,
	maxConsecutiveTimeoutRetries: 2,
	maxIterations: 10,
	noClean: false,
	noWorkBackoffMs: 0,
	quitOnAbort: 0,
	rateLimitBackoffSeconds: 300,
	rateLimitBufferSeconds: 60,
	reasoningEffort: 'low',
	timeoutSeconds: 3600,
	preflightDoctor: false,
};

afterEach(async () => {
	await rm(rootDir, { recursive: true, force: true });
});

async function makeCatalog(
	catalogDir: string,
	audits: { name: string; priority: string }[]
): Promise<void> {
	const auditsDir = join(catalogDir, 'audits');
	await mkdir(auditsDir, { recursive: true });
	for (const audit of audits) {
		await writeFile(
			join(auditsDir, `${audit.name}.md`),
			`${[
				'---',
				`title: '${audit.name}'`,
				`priority: '${audit.priority}'`,
				'category: Core Quality',
				'---',
				'',
				`# ${audit.name}`,
				'',
				'Body.',
			].join('\n')}\n`
		);
	}
}

async function writeFullHardeningProfile(projectDir: string): Promise<void> {
	const dir = join(projectDir, '.aidd');
	await mkdir(dir, { recursive: true });
	await writeFile(
		join(dir, 'project-profile.json'),
		`${JSON.stringify(
			{
				authMode: 'tenant_rbac',
				bucket: 'public_multi_tenant',
				criticality: 'business_critical',
				dataSensitivity: 'confidential',
				deployment: 'public_server',
				externalIntegrations: 'write_capable',
				source: 'explicit',
				updatedAt: '2026-05-16T00:00:00.000Z',
			},
			null,
			2
		)}\n`
	);
}

function makeContext(
	projectDir: string,
	catalogDir: string,
	scoringRoots?: readonly string[]
): ModeContext {
	return {
		projectDir,
		rootDir: catalogDir,
		store: new FileAiddStore(projectDir),
		...(scoringRoots ? { scoringRoots } : {}),
	};
}

function makePlan(projectDir: string, extraArgs: string[]) {
	return resolveRunPlan(
		parseArgs(['--project-dir', projectDir, '--cli', 'native', ...extraArgs]),
		config
	);
}

describe('audit selection ranking', () => {
	test('--audit-all reorders discovered audits by change-potential score', async () => {
		const catalogDir = join(rootDir, 'catalog');
		const projectDir = join(rootDir, 'project');
		await makeCatalog(catalogDir, [
			{ name: 'AAA_REORG', priority: 'Medium' },
			{ name: 'SECURITY', priority: 'Critical' },
		]);
		await writeFullHardeningProfile(projectDir);

		const plan = makePlan(projectDir, ['--audit-all']);
		const ordered = await auditNames(plan, makeContext(projectDir, catalogDir));

		// Alphabetical would yield ['AAA_REORG', 'SECURITY']. The ranker should put
		// the Critical+actionable audit first even with zero prior evidence.
		expect(ordered).toEqual(['SECURITY', 'AAA_REORG']);
	});

	test('explicit --audit X,Y preserves the user-given order verbatim', async () => {
		const catalogDir = join(rootDir, 'catalog');
		const projectDir = join(rootDir, 'project');
		await makeCatalog(catalogDir, [
			{ name: 'AAA_REORG', priority: 'Medium' },
			{ name: 'SECURITY', priority: 'Critical' },
		]);
		await writeFullHardeningProfile(projectDir);

		const plan = makePlan(projectDir, ['--audit', 'AAA_REORG,SECURITY']);
		const ordered = await auditNames(plan, makeContext(projectDir, catalogDir));

		expect(ordered).toEqual(['AAA_REORG', 'SECURITY']);
	});

	test('local-project evidence promotes a low-priority audit above a higher-priority one', async () => {
		const catalogDir = join(rootDir, 'catalog');
		const projectDir = join(rootDir, 'project');
		await makeCatalog(catalogDir, [
			{ name: 'AAA_REORG', priority: 'Medium' },
			{ name: 'SECURITY', priority: 'Critical' },
		]);
		await writeFullHardeningProfile(projectDir);

		// Three completed run findings for AAA_REORG (4 priority + 6*3 completed = 22) vs
		// SECURITY baseline only (12 priority + 5 actionable = 17). AAA_REORG should win.
		const ledgerPath = join(projectDir, '.aidd', 'runs.jsonl');
		await writeFile(
			ledgerPath,
			[
				JSON.stringify({
					summary: 'audit AAA_REORG finished with 1 finding(s) created',
					stopReason: 'completed',
				}),
				JSON.stringify({
					summary: 'audit AAA_REORG finished with 2 finding(s) created',
					stopReason: 'completed',
				}),
				JSON.stringify({
					summary: 'audit AAA_REORG finished with 1 finding(s) created',
					stopReason: 'completed',
				}),
				'',
			].join('\n')
		);

		const plan = makePlan(projectDir, ['--audit-all']);
		const ordered = await auditNames(plan, makeContext(projectDir, catalogDir));
		expect(ordered[0]).toBe('AAA_REORG');
	});

	test('cross-root evidence under scoringRoots promotes the audit with fleet-wide hits', async () => {
		const catalogDir = join(rootDir, 'catalog');
		const projectDir = join(rootDir, 'project');
		const applicationsRoot = join(rootDir, 'apps');
		await makeCatalog(catalogDir, [
			{ name: 'AAA_REORG', priority: 'Medium' },
			{ name: 'SECURITY', priority: 'Critical' },
		]);
		await writeFullHardeningProfile(projectDir);

		// The selected project has zero local evidence — alphabetical fallback would
		// keep AAA_REORG first if not for Critical's baseline. We seed a sibling app
		// with 4 completed AAA_REORG runs so cross-root fleet evidence (24 points)
		// beats SECURITY's bare Critical+actionable baseline (17 points).
		const siblingDir = join(applicationsRoot, 'sibling-app');
		await mkdir(join(siblingDir, '.aidd'), { recursive: true });
		await writeFile(
			join(siblingDir, '.aidd', 'runs.jsonl'),
			[
				JSON.stringify({
					summary: 'audit AAA_REORG finished with 1 finding(s) created',
					stopReason: 'completed',
				}),
				JSON.stringify({
					summary: 'audit AAA_REORG finished with 1 finding(s) created',
					stopReason: 'completed',
				}),
				JSON.stringify({
					summary: 'audit AAA_REORG finished with 1 finding(s) created',
					stopReason: 'completed',
				}),
				JSON.stringify({
					summary: 'audit AAA_REORG finished with 1 finding(s) created',
					stopReason: 'completed',
				}),
				'',
			].join('\n')
		);

		const plan = makePlan(projectDir, ['--audit-all']);
		const ordered = await auditNames(
			plan,
			makeContext(projectDir, catalogDir, [applicationsRoot])
		);
		expect(ordered[0]).toBe('AAA_REORG');
	});

	test('--audit-all includes reports made stale by committed source changes', async () => {
		const catalogDir = join(rootDir, 'catalog');
		const projectDir = join(rootDir, 'project');
		await makeCatalog(catalogDir, [{ name: 'SECURITY', priority: 'Critical' }]);
		await writeFullHardeningProfile(projectDir);
		await initGitProject(projectDir);
		const store = new FileAiddStore(projectDir);
		await store.writeAuditReport('SECURITY', '# SECURITY done');
		for (let index = 0; index < 10; index++) {
			await commitSourceFile(
				projectDir,
				`src/change-${index}.ts`,
				`export const change${index} = ${index};\n`
			);
		}

		const plan = makePlan(projectDir, ['--audit-all']);
		const ordered = await auditNames(plan, makeContext(projectDir, catalogDir));

		expect(ordered).toEqual(['SECURITY']);
	});
});

async function initGitProject(projectDir: string): Promise<void> {
	await mkdir(join(projectDir, 'src'), { recursive: true });
	await runGit(projectDir, ['init']);
	await runGit(projectDir, ['config', 'user.email', 'aidd-test@example.invalid']);
	await runGit(projectDir, ['config', 'user.name', 'aidd Test']);
	await writeFile(join(projectDir, 'package.json'), '{"name":"test-project"}\n');
	await runGit(projectDir, ['add', 'package.json']);
	await runGit(projectDir, ['commit', '-m', 'chore: init']);
}

async function commitSourceFile(
	projectDir: string,
	relativePath: string,
	content: string
): Promise<void> {
	await writeFile(join(projectDir, relativePath), content);
	await runGit(projectDir, ['add', relativePath]);
	await runGit(projectDir, ['commit', '-m', `feat: update ${relativePath}`]);
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
