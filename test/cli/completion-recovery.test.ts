import { describe, expect, test } from 'bun:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { FileAiddStore } from 'aidd-shared/metadata/store';

import { attemptCompletionMarkerRecovery } from '../../cli/src/orchestrator/run/completion-recovery.ts';
import type { FeatureScopeAudit } from '../../cli/src/orchestrator/run/types.ts';
import { testTempDir } from '../_helpers/temp.ts';

const featureId = 'stranded-feature';

async function git(dir: string, args: string[]): Promise<void> {
	const proc = Bun.spawn(['git', '-C', dir, ...args], {
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if ((await proc.exited) !== 0) {
		throw new Error(`git ${args.join(' ')} failed: ${await new Response(proc.stderr).text()}`);
	}
}

async function gitOut(dir: string, args: string[]): Promise<string> {
	const proc = Bun.spawn(['git', '-C', dir, ...args], {
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	await proc.exited;
	return (await new Response(proc.stdout).text()).trim();
}

// A real repo whose package.json carries the given gate script, one committed baseline file,
// and a completed+passes feature on disk — the exact state the stranded run left behind. The
// run's own uncommitted work is src.ts, recorded as an absolute path the way tool events are.
async function makeRecoveryFixture(
	name: string,
	gateScripts: Record<string, string>,
): Promise<{ projectDir: string; store: FileAiddStore }> {
	const root = await testTempDir(`completion-recovery-${name}`);
	const projectDir = join(root, 'project');
	await mkdir(join(projectDir, '.aidd', 'features', featureId), { recursive: true });
	await git(projectDir, ['init', '-q']);
	await git(projectDir, ['config', 'user.email', 'test@aidd.local']);
	await git(projectDir, ['config', 'user.name', 'aidd test']);
	await git(projectDir, ['config', 'commit.gpgsign', 'false']);
	await writeFile(
		join(projectDir, 'package.json'),
		JSON.stringify({ name: 'fixture', scripts: gateScripts }),
	);
	await writeFile(join(projectDir, 'base.ts'), 'export const base = 1;\n');
	const store = new FileAiddStore(projectDir);
	await store.writeFeature({
		id: featureId,
		passes: true,
		status: 'completed',
		title: 'Stranded but finished work',
	});
	await git(projectDir, ['add', '-A']);
	await git(projectDir, ['commit', '-q', '-m', 'baseline']);
	await writeFile(join(projectDir, 'src.ts'), 'export const added = 2;\n');
	return { projectDir, store };
}

function scopeWith(unaccepted: string[]): FeatureScopeAudit {
	return {
		allowedFeatureIds: [featureId],
		completedFeatures: unaccepted,
		completionMarkerIssue:
			unaccepted.length > 0 ? 'completion_marker_missing_or_unaccepted' : undefined,
		extraCompletedFeatures: [],
		invalidFeatureMetadata: [],
		scopeOverrun: false,
		selectedFeatures: [],
		unacceptedCompletedFeatures: unaccepted,
	};
}

const work = { description: 'Stranded work', id: featureId, kind: 'feature' as const };

function inputFor(
	projectDir: string,
	store: FileAiddStore,
	overrides: Partial<Parameters<typeof attemptCompletionMarkerRecovery>[0]> = {},
): Parameters<typeof attemptCompletionMarkerRecovery>[0] {
	return {
		dirtySourcePathsAtStart: new Set<string>(),
		featureScope: scopeWith([featureId]),
		projectDir,
		// Recorded the way tool events record paths: absolute, native separators.
		runRecordedPaths: new Set([join(projectDir, 'src.ts')]),
		store,
		work,
		...overrides,
	};
}

describe('attemptCompletionMarkerRecovery', () => {
	test('commits recorded run work when the gate passes', async () => {
		const { projectDir, store } = await makeRecoveryFixture('pass', { 'smoke:qc': 'exit 0' });
		const outcome = await attemptCompletionMarkerRecovery(inputFor(projectDir, store));
		expect(outcome).toBeDefined();
		expect(outcome?.gateCommand).toBe('bun run smoke:qc');
		expect(outcome?.commit.subject).toBe(`feat(${featureId}): Stranded but finished work`);
		expect(await gitOut(projectDir, ['status', '--porcelain'])).toBe('');
		const message = await gitOut(projectDir, ['log', '-1', '--format=%B']);
		expect(message).toContain('completion recovery');
		expect(message).toContain('bun run smoke:qc');
	});

	test('stages recorded .aidd metadata alongside the recorded work', async () => {
		const { projectDir, store } = await makeRecoveryFixture('metadata', {
			'smoke:qc': 'exit 0',
		});
		await writeFile(join(projectDir, '.aidd', 'CHANGELOG.md'), '## recovered\n');
		const outcome = await attemptCompletionMarkerRecovery(
			inputFor(projectDir, store, {
				runRecordedPaths: new Set(['.aidd/CHANGELOG.md', 'src.ts']),
			}),
		);
		expect(outcome).toBeDefined();
		expect(await gitOut(projectDir, ['status', '--porcelain'])).toBe('');
		const committed = await gitOut(projectDir, ['show', '--name-only', '--format=', 'HEAD']);
		expect(committed).toContain('.aidd/CHANGELOG.md');
	});

	test('leaves another run metadata outside the recovery commit', async () => {
		const { projectDir, store } = await makeRecoveryFixture('foreign-metadata', {
			'smoke:qc': 'exit 0',
		});
		await writeFile(
			join(projectDir, '.aidd', 'CHANGELOG.md'),
			'Another run is writing this.\n',
		);
		expect(await attemptCompletionMarkerRecovery(inputFor(projectDir, store))).toBeDefined();
		expect(
			await gitOut(projectDir, ['show', '--name-only', '--format=', 'HEAD']),
		).not.toContain('.aidd/CHANGELOG.md');
		expect(await gitOut(projectDir, ['status', '--porcelain'])).toContain('.aidd/CHANGELOG.md');
	});

	test('falls back to smoke:qc:fast when the full gate is absent', async () => {
		const { projectDir, store } = await makeRecoveryFixture('fast-only', {
			'smoke:qc:fast': 'exit 0',
		});
		const outcome = await attemptCompletionMarkerRecovery(inputFor(projectDir, store));
		expect(outcome?.gateCommand).toBe('bun run smoke:qc:fast');
	});

	test('refuses when the gate fails, leaving the tree untouched', async () => {
		const { projectDir, store } = await makeRecoveryFixture('fail', { 'smoke:qc': 'exit 1' });
		const headBefore = await gitOut(projectDir, ['rev-parse', 'HEAD']);
		const outcome = await attemptCompletionMarkerRecovery(inputFor(projectDir, store));
		expect(outcome).toBeUndefined();
		expect(await gitOut(projectDir, ['rev-parse', 'HEAD'])).toBe(headBefore);
		expect(await gitOut(projectDir, ['status', '--porcelain'])).toContain('src.ts');
	});

	test('refuses when a dirty path was never recorded by the run (operator mid-run edit)', async () => {
		const { projectDir, store } = await makeRecoveryFixture('unrecorded', {
			'smoke:qc': 'exit 0',
		});
		// Dirty, not in the baseline, and NOT in the run's recorded file changes — exactly what
		// an operator edit made while the run was in flight looks like.
		await writeFile(join(projectDir, 'operator.ts'), 'export const wip = true;\n');
		const outcome = await attemptCompletionMarkerRecovery(inputFor(projectDir, store));
		expect(outcome).toBeUndefined();
		expect(await gitOut(projectDir, ['status', '--porcelain'])).toContain('operator.ts');
	});

	test('refuses when operator dirt from before the run is still present', async () => {
		const { projectDir, store } = await makeRecoveryFixture('baseline-dirt', {
			'smoke:qc': 'exit 0',
		});
		await writeFile(join(projectDir, 'base.ts'), 'export const base = 99;\n');
		const outcome = await attemptCompletionMarkerRecovery(
			inputFor(projectDir, store, { dirtySourcePathsAtStart: new Set(['base.ts']) }),
		);
		expect(outcome).toBeUndefined();
		expect(await gitOut(projectDir, ['status', '--porcelain'])).toContain('base.ts');
	});

	test('refuses when the baseline is unknown', async () => {
		const { projectDir, store } = await makeRecoveryFixture('no-baseline', {
			'smoke:qc': 'exit 0',
		});
		const outcome = await attemptCompletionMarkerRecovery(
			inputFor(projectDir, store, { dirtySourcePathsAtStart: undefined }),
		);
		expect(outcome).toBeUndefined();
	});

	test('refuses when the feature is not completed+passes on disk', async () => {
		const { projectDir, store } = await makeRecoveryFixture('not-complete', {
			'smoke:qc': 'exit 0',
		});
		await store.writeFeature({ id: featureId, passes: false, status: 'in_progress' });
		const outcome = await attemptCompletionMarkerRecovery(inputFor(projectDir, store));
		expect(outcome).toBeUndefined();
	});

	test('refuses when no gate script exists to prove the tree', async () => {
		const { projectDir, store } = await makeRecoveryFixture('no-gate', {});
		const outcome = await attemptCompletionMarkerRecovery(inputFor(projectDir, store));
		expect(outcome).toBeUndefined();
	});

	test('refuses for non-feature work and for unrelated unaccepted features', async () => {
		const { projectDir, store } = await makeRecoveryFixture('wrong-work', {
			'smoke:qc': 'exit 0',
		});
		expect(
			await attemptCompletionMarkerRecovery(
				inputFor(projectDir, store, {
					work: { description: 'todo work', id: 'todo-1', kind: 'todo' },
				}),
			),
		).toBeUndefined();
		expect(
			await attemptCompletionMarkerRecovery(
				inputFor(projectDir, store, { featureScope: scopeWith(['some-other-feature']) }),
			),
		).toBeUndefined();
	});
});
