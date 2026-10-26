import type { RunPlan } from 'aidd-shared/plan/types';

import { FileAiddStore } from 'aidd-shared/metadata/store';
import { parseArgs } from 'aidd-shared/args/index';
import { orchestratorExitCodes } from 'aidd-shared/orchestrator/result';
import { afterEach, expect, spyOn, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
	prepareWorktreeRun,
	worktreeOrchestratorDeps,
} from '../../cli/src/orchestrator/run/worktree-run-setup.ts';
import { runOrchestrator } from '../../cli/src/orchestrator/orchestrator.ts';
import { removeRunWorktree } from '../../cli/src/orchestrator/run/worktree-manager.ts';
import {
	FakeBackend,
	gitHeavyPlan,
	rootDir,
	saturatedSuiteTestTimeoutMs,
} from './_helpers/orchestrator-fixture.ts';
import { testTempDir } from '../_helpers/temp.ts';
import { removeTempTree } from '../backend/_helpers/remove-temp-tree.ts';

const roots: string[] = [];

function git(cwd: string, ...args: string[]): string {
	const result = Bun.spawnSync(['git', '-C', cwd, ...args], {
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
	return new TextDecoder().decode(result.stdout).trim();
}

async function fixture(committed = true): Promise<{ plan: RunPlan; root: string }> {
	const root = await testTempDir('aidd-audit-worktree-');
	roots.push(root);
	git(root, 'init');
	git(root, 'config', 'user.email', 'test@example.com');
	git(root, 'config', 'user.name', 'aidd test');
	await mkdir(join(root, '.aidd'), { recursive: true });
	await writeFile(join(root, '.aidd', 'spec.md'), '# Synthetic fixture\n');
	await writeFile(join(root, '.gitignore'), '.aidd/\ndata/\n');
	await writeFile(join(root, 'source.txt'), 'original\n');
	if (committed) {
		git(root, 'add', '.gitignore', 'source.txt');
		git(root, 'commit', '-m', 'fixture');
	}
	return { plan: { mode: 'audit', projectDir: root } as RunPlan, root };
}

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => removeTempTree(root)));
});

test('audit edits and restores in a default worktree while the live source stays unchanged', async () => {
	const { plan, root } = await fixture();
	const initialHead = git(root, 'rev-parse', 'HEAD');
	await writeFile(join(root, 'source.txt'), 'operator work\n');
	const context = await prepareWorktreeRun({
		launcherManaged: false,
		plan,
		requested: false,
		runId: 'restore',
		webDataDir: join(root, 'data'),
	});
	expect(context).not.toBeNull();
	const checkout = plan.worktree!.dir;
	expect((await readFile(join(checkout, 'source.txt'), 'utf8')).trim()).toBe('original');
	expect(await readFile(join(checkout, '.aidd', 'spec.md'), 'utf8')).toContain(
		'Synthetic fixture',
	);
	await writeFile(join(checkout, 'source.txt'), 'probe mutation\n');
	expect(await readFile(join(root, 'source.txt'), 'utf8')).toBe('operator work\n');
	await writeFile(join(checkout, 'source.txt'), 'original\n');
	const deps = worktreeOrchestratorDeps(plan, context!, new FileAiddStore(root), async () => {
		throw new Error('an audit must never resolve a source merge');
	});
	const result = await deps.finalizeWorktree!(0);
	expect(result.overrideExitCode).toBeUndefined();
	expect(result.mergeStatus).toBe('discarded');
	expect(existsSync(checkout)).toBe(false);
	expect(git(root, 'rev-parse', 'HEAD')).toBe(initialHead);
	expect(await readFile(join(root, 'source.txt'), 'utf8')).toBe('operator work\n');
});

test('an audit source commit is discarded and its tracked path is an integrity violation', async () => {
	const { plan, root } = await fixture();
	const initialHead = git(root, 'rev-parse', 'HEAD');
	const context = await prepareWorktreeRun({
		launcherManaged: false,
		plan,
		requested: false,
		runId: 'violation',
		webDataDir: join(root, 'data'),
	});
	const checkout = plan.worktree!.dir;
	await writeFile(join(checkout, 'source.txt'), 'unapproved source\n');
	git(checkout, 'add', 'source.txt');
	git(checkout, 'commit', '-m', 'audit must not merge this');
	const deps = worktreeOrchestratorDeps(plan, context!, new FileAiddStore(root), async () => {
		throw new Error('an audit must never merge');
	});
	const result = await deps.finalizeWorktree!(0);
	expect(result.auditIntegrity?.paths).toEqual(['source.txt']);
	expect(result.overrideExitCode).toBe(orchestratorExitCodes.writeAllowlistViolation);
	expect(existsSync(checkout)).toBe(false);
	expect(git(root, 'rev-parse', 'HEAD')).toBe(initialHead);
	expect(await readFile(join(root, 'source.txt'), 'utf8')).toBe('original\n');
});

test('default audit isolation refuses an unborn repository', async () => {
	const { plan, root } = await fixture(false);
	await expect(
		prepareWorktreeRun({
			launcherManaged: false,
			plan,
			requested: false,
			runId: 'unborn',
			webDataDir: join(root, 'data'),
		}),
	).rejects.toThrow('Audit isolation requires a committed Git HEAD');
	expect(plan.worktree).toBeUndefined();
});

test.each([false, true])(
	'isolated audit persists accepted results and records source violation=%s',
	async (violation) => {
		const { root } = await fixture();
		const initialHead = git(root, 'rev-parse', 'HEAD');
		const store = new FileAiddStore(root);
		await store.writeRoadmap({ features: {}, milestones: {} });
		const plan = gitHeavyPlan(root, ['--audit', 'SECURITY']);
		const context = await prepareWorktreeRun({
			launcherManaged: false,
			plan,
			requested: false,
			runId: `result-${violation}`,
			webDataDir: join(root, 'data'),
		});
		const checkout = plan.worktree!.dir;
		const backend = new FakeBackend(
			[
				{
					type: 'assistant_text',
					chunk: `AIDD_RESULT: ${JSON.stringify({
						auditName: 'SECURITY',
						auditFindings: [
							{
								affectedFiles: ['source.txt'],
								description: 'Verified: source.txt:1 - synthetic guard is missing.',
								id: 'audit-security-isolation-test',
								severity: 'Low',
								spec: 'Add the missing guard and a regression check.',
								title: 'Synthetic missing guard',
							},
						],
						reportMarkdown: '# SECURITY Audit Report\n\nOne synthetic finding.',
					})}\n`,
				},
				{ type: 'done', exitCode: 0, filesModified: [] },
			],
			async (_call, input) => {
				expect(input.cwd).toBe(checkout);
				await writeFile(join(input.cwd, 'source.txt'), 'temporary audit probe\n');
				expect(await readFile(join(root, 'source.txt'), 'utf8')).toBe('original\n');
				if (!violation) await writeFile(join(input.cwd, 'source.txt'), 'original\n');
				// Agent-written metadata is untrusted; only its accepted result may cross back.
				await new FileAiddStore(checkout).writeFeature({
					id: 'injected',
					title: 'Do not copy',
					status: 'backlog',
					passes: false,
				});
			},
		);
		const code = await runOrchestrator(plan, {
			backend,
			rootDir,
			store,
			...worktreeOrchestratorDeps(plan, context!, store, async () => {
				throw new Error('audit merge forbidden');
			}),
		});
		expect(code).toBe(violation ? orchestratorExitCodes.writeAllowlistViolation : 0);
		expect(backend.calls).toBe(1);
		expect(existsSync(checkout)).toBe(false);
		expect(git(root, 'rev-parse', 'HEAD')).toBe(initialHead);
		expect(await readFile(join(root, 'source.txt'), 'utf8')).toBe('original\n');
		expect(
			(await store.listFeatures({ includeAudit: true })).map((feature) => feature.id),
		).toEqual(['audit-security-isolation-test']);
		expect((await store.readFindingEvents()).map((event) => event.event)).toEqual(['emitted']);
		expect((await store.readRoadmap()).features).toHaveProperty(
			'audit-security-isolation-test',
		);
		const reports = await store.listAuditReports();
		expect(reports).toHaveLength(1);
		expect(await store.readAuditReport(reports[0]!)).toContain('One synthetic finding');
		const records = (await readFile(join(root, '.aidd', 'runs.jsonl'), 'utf8'))
			.trim()
			.split(/\r?\n/);
		expect(records).toHaveLength(1);
		const record = JSON.parse(records[0]!) as {
			exitCode: number;
			stopReason: string;
			summary: string;
		};
		expect(record.exitCode).toBe(code);
		if (violation) {
			expect(record.stopReason).toBe('exit_error');
			expect(record.summary).toContain('[audit-integrity-violation]');
			expect(record.summary).toContain('source.txt');
		}
		expect(
			(await readdir(join(root, '.aidd', 'iterations'))).some((name) =>
				name.endsWith('.json'),
			),
		).toBe(true);
	},
	saturatedSuiteTestTimeoutMs,
);

test(
	'the explicit live-tree audit opt-out warns at startup and in the canonical run record',
	async () => {
		const { root } = await fixture();
		const plan = gitHeavyPlan(root, ['--audit', 'SECURITY', '--audit-live-tree']);
		expect(plan.audit?.liveTree).toBe(true);
		const warning = spyOn(console, 'warn').mockImplementation(() => {});
		try {
			expect(
				await prepareWorktreeRun({
					launcherManaged: false,
					plan,
					requested: false,
					runId: 'live',
				}),
			).toBeNull();
			expect(warning).toHaveBeenCalledWith(expect.stringContaining('[audit-live-tree]'));
		} finally {
			warning.mockRestore();
		}
		const backend = new FakeBackend([
			{
				type: 'assistant_text',
				chunk: `AIDD_RESULT: ${JSON.stringify({ auditName: 'SECURITY', auditFindings: [], noFindingsJustification: 'Inspected source.txt with rg for unchecked input and found no runtime authentication or request surface.', reportMarkdown: '# SECURITY Audit Report' })}\n`,
			},
			{ type: 'done', exitCode: 0, filesModified: [] },
		]);
		expect(
			await runOrchestrator(plan, { backend, rootDir, store: new FileAiddStore(root) }),
		).toBe(0);
		expect(backend.inputs[0]?.cwd).toBe(root);
		const ledger = await readFile(join(root, '.aidd', 'runs.jsonl'), 'utf8');
		expect(ledger).toContain('[audit-live-tree]');
	},
	saturatedSuiteTestTimeoutMs,
);

test('the audit live-tree flag rejects non-audit and contradictory worktree requests', () => {
	expect(() => parseArgs(['--audit-live-tree'])).toThrow('requires an audit run');
	expect(() => parseArgs(['--audit', 'SECURITY', '--audit-live-tree', '--worktree'])).toThrow(
		'cannot be combined',
	);
});

test('audit finalization retains its checkout when tracked-file inspection fails', async () => {
	const { plan, root } = await fixture();
	const context = await prepareWorktreeRun({
		launcherManaged: false,
		plan,
		requested: false,
		runId: 'bad-base',
		webDataDir: join(root, 'data'),
	});
	const worktree = plan.worktree!;
	const originalBase = worktree.baseSha;
	worktree.baseSha = 'missing-audit-base-commit';
	try {
		const result = await worktreeOrchestratorDeps(
			plan,
			context!,
			new FileAiddStore(root),
			async () => false,
		).finalizeWorktree!(0);
		expect(result.overrideExitCode).toBe(orchestratorExitCodes.writeAllowlistViolation);
		expect(result.auditIntegrity?.error).toContain('tracked-file diff unavailable');
		expect(existsSync(worktree.dir)).toBe(true);
		expect(await readFile(join(root, 'source.txt'), 'utf8')).toBe('original\n');
	} finally {
		worktree.baseSha = originalBase;
		await removeRunWorktree(root, worktree);
	}
});
