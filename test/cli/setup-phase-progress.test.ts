import { afterEach, describe, expect, test } from 'bun:test';
import type { ResolvedConfig } from 'aidd-shared/config';
import { FileAiddStore } from 'aidd-shared/metadata/store';
import { parseArgs } from 'aidd-shared/args/index';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
	createSetupProgressTracker,
	processPhaseResult,
} from '../../cli/src/modes/coding/phase-result.ts';
import { resolveRunPlan } from '../../cli/src/plan/resolve.ts';
import { removeTempTree } from '../../shared/src/lib/remove-temp-tree.ts';
import { testTempDir } from '../_helpers/temp.ts';

const config: ResolvedConfig = {
	cli: 'native',
	dirtyTreeThreshold: 50,
	idleNudgeTimeoutSeconds: 1,
	idleTimeoutSeconds: 1,
	maxConsecutiveTimeoutRetries: 2,
	maxIterations: 10,
	noClean: false,
	noWorkBackoffMs: 0,
	preflightDoctor: false,
	quitOnAbort: 0,
	rateLimitBackoffSeconds: 300,
	rateLimitBufferSeconds: 60,
	reasoningEffort: 'low',
	timeoutSeconds: 3600,
};

const roots: string[] = [];

afterEach(async () => {
	for (const root of roots.splice(0)) await removeTempTree(root);
});

/** A project with code but no onboarding artifacts, so the detected phase is `onboarding`. */
async function onboardingProject(): Promise<string> {
	const root = await testTempDir('aidd-setup-progress-');
	roots.push(root);
	await mkdir(join(root, '.aidd', 'features'), { recursive: true });
	await writeFile(join(root, 'index.ts'), 'export const app = 1;\n');
	return root;
}

function planFor(projectDir: string) {
	const plan = resolveRunPlan(
		parseArgs(['--project-dir', projectDir, '--cli', 'native']),
		config,
	);
	plan.prompt.phase = 'onboarding';
	return plan;
}

function contextFor(projectDir: string) {
	return { projectDir, store: new FileAiddStore(projectDir) };
}

const iteration = { exitCode: 0 };

// An iteration that changes nothing readiness reads cannot be improved on by repeating it: the next
// one re-reads the same disk state and restates the same verdict. Without this the run spent every
// remaining iteration doing exactly that.
describe('setup phase no-progress stop', () => {
	test('iterates once, then stops when the verdict repeats', async () => {
		const projectDir = await onboardingProject();
		const plan = planFor(projectDir);
		const tracker = createSetupProgressTracker();

		const first = await processPhaseResult(plan, contextFor(projectDir), iteration, tracker);
		expect(first.complete).toBe(false);

		const second = await processPhaseResult(plan, contextFor(projectDir), iteration, tracker);
		expect(second.complete).toBe(true);
		expect(second.summary).toContain('produced no change across two iterations');
		expect(second.summary).toContain('.aidd/spec.md');
	});

	test('keeps iterating while the missing artifacts shrink', async () => {
		const projectDir = await onboardingProject();
		const plan = planFor(projectDir);
		const tracker = createSetupProgressTracker();

		expect(
			(await processPhaseResult(plan, contextFor(projectDir), iteration, tracker)).complete,
		).toBe(false);
		await writeFile(join(projectDir, '.aidd', 'spec.md'), '# Spec\n');
		const second = await processPhaseResult(plan, contextFor(projectDir), iteration, tracker);
		expect(second.complete).toBe(false);
		expect(second.summary).not.toContain('produced no change');
	});

	// Without a tracker the caller has no cross-iteration memory, so the check has to be inert
	// rather than stop on the first pass.
	test('never stops early when no tracker is supplied', async () => {
		const projectDir = await onboardingProject();
		const plan = planFor(projectDir);

		expect((await processPhaseResult(plan, contextFor(projectDir), iteration)).complete).toBe(
			false,
		);
		expect((await processPhaseResult(plan, contextFor(projectDir), iteration)).complete).toBe(
			false,
		);
	});

	test('completes as soon as the project reaches the coding phase', async () => {
		const projectDir = await onboardingProject();
		const plan = planFor(projectDir);
		const tracker = createSetupProgressTracker();

		await mkdir(join(projectDir, '.aidd', 'features', 'first'), { recursive: true });
		await writeFile(
			join(projectDir, '.aidd', 'features', 'first', 'feature.json'),
			JSON.stringify({ id: 'first', passes: false, status: 'backlog', title: 'First' }),
		);
		await writeFile(join(projectDir, '.aidd', 'spec.md'), '# Spec\n');
		await writeFile(join(projectDir, '.aidd', 'CHANGELOG.md'), '# Changelog\n');

		const outcome = await processPhaseResult(plan, contextFor(projectDir), iteration, tracker);
		expect(outcome.complete).toBe(true);
		expect(outcome.summary).toContain('ready for coding');
	});
});
