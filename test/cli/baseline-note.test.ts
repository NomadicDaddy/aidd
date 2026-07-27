import { describe, expect, test } from 'bun:test';

import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { AiddMode, RunPlan } from 'aidd-shared/plan/types';

import type {
	FinalCheckSummary,
	IterationDetails,
} from '../../cli/src/orchestrator/details/types.ts';

import {
	armBaselineNoteIfNeeded,
	IterationPromptContext,
	iterationProvedCleanBaseline,
} from '../../cli/src/orchestrator/run/prompt-context.ts';

import { testTempDir } from '../_helpers/temp.ts';

// The pre-implementation quality gate costs minutes of every iteration on a large project. When the
// previous iteration of the same run already proved the tree green and nothing has moved since,
// aidd waives that gate for one iteration — but only after verifying the claim against git, never
// on the loop's say-so alone.

class CapturingContext extends IterationPromptContext {
	note: string | undefined;

	override setBaselineNote(note: string | undefined): void {
		this.note = note;
	}
}

async function gitRepoWithCommit(): Promise<string> {
	const dir = await testTempDir('aidd-baseline-');
	const run = (args: string[]) =>
		Bun.spawnSync(['git', '-C', dir, ...args], { windowsHide: true });
	Bun.spawnSync(['git', 'init', dir], { windowsHide: true });
	run(['config', 'user.email', 'test@example.com']);
	run(['config', 'user.name', 'aidd test']);
	await writeFile(join(dir, 'file.txt'), 'baseline\n');
	run(['add', '.']);
	run(['commit', '-m', 'baseline']);
	return dir;
}

function makePlan(projectDir: string, mode: AiddMode): RunPlan {
	return { mode, projectDir } as unknown as RunPlan;
}

async function arm(input: {
	dir: string;
	mode?: AiddMode;
	previousVerified?: boolean;
}): Promise<string | undefined> {
	const context = new CapturingContext(input.dir, input.dir);
	await armBaselineNoteIfNeeded(
		context,
		makePlan(input.dir, input.mode ?? 'coding'),
		input.previousVerified ?? true,
	);
	return context.note;
}

function detailsWithChecks(finalChecks: FinalCheckSummary): IterationDetails {
	return { summary: { finalChecks } } as unknown as IterationDetails;
}

describe('iterationProvedCleanBaseline', () => {
	// The completion marker is the agent's own claim and aidd only verifies that something was
	// committed. An agent that commits without running the gate must not license the next iteration
	// to skip its baseline gate as well — then the run would never test the tree at all.
	test('an iteration that recorded no gate command proves nothing', () => {
		expect(iterationProvedCleanBaseline(detailsWithChecks({}))).toBe(false);
	});

	test('the project QC script passing is proof', () => {
		expect(iterationProvedCleanBaseline(detailsWithChecks({ smokeQc: 'passed' }))).toBe(true);
	});

	test('a typecheck+build pair stands in where there is no single QC script', () => {
		expect(
			iterationProvedCleanBaseline(
				detailsWithChecks({ build: 'passed', typecheck: 'passed' }),
			),
		).toBe(true);
		// Typecheck alone is not the gate.
		expect(iterationProvedCleanBaseline(detailsWithChecks({ typecheck: 'passed' }))).toBe(
			false,
		);
	});

	test('any recorded failure disarms the skip', () => {
		expect(
			iterationProvedCleanBaseline(
				detailsWithChecks({ format: 'failed', smokeQc: 'passed' }),
			),
		).toBe(false);
	});
});

describe('armBaselineNoteIfNeeded', () => {
	test('arms the skip and names the sha it is valid for', async () => {
		const dir = await gitRepoWithCommit();
		const head = new TextDecoder()
			.decode(
				Bun.spawnSync(['git', '-C', dir, 'rev-parse', 'HEAD'], { windowsHide: true })
					.stdout,
			)
			.trim();

		const note = await arm({ dir });

		expect(note).toContain('skip the pre-implementation quality gate');
		expect(note).toContain(head);
		// The gate that still has to run is the post-change one; the completion bar is unchanged.
		expect(note).toContain('post-change');
	});

	test('arms nothing when the previous iteration did not verify a baseline', async () => {
		const dir = await gitRepoWithCommit();
		expect(await arm({ dir, previousVerified: false })).toBeUndefined();
	});

	test('arms nothing when the worktree has moved since', async () => {
		const dir = await gitRepoWithCommit();
		await writeFile(join(dir, 'stray.txt'), 'uncommitted\n');
		expect(await arm({ dir })).toBeUndefined();
	});

	// aidd's own .aidd metadata churns on every iteration and is gitignored in most profiles; it is
	// not project work, so it must not invalidate the baseline.
	test('ignores aidd metadata churn when judging the tree', async () => {
		const dir = await gitRepoWithCommit();
		await Bun.write(join(dir, '.aidd', 'CHANGELOG.md'), '# changed\n');
		expect(await arm({ dir })).toBeDefined();
	});

	test('arms nothing for modes whose prompt has no pre-implementation gate', async () => {
		const dir = await gitRepoWithCommit();
		expect(await arm({ dir, mode: 'audit' })).toBeUndefined();
	});

	test('arms nothing outside a git repository', async () => {
		const dir = await testTempDir('aidd-baseline-nogit-');
		expect(await arm({ dir })).toBeUndefined();
	});
});
