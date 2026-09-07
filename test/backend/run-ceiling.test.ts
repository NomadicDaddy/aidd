import { Database } from 'bun:sqlite';
import { describe, expect, test } from 'bun:test';
import { wrapWebDatabase } from '../../backend/src/db/client.ts';
import { migrateWebDatabase } from '../../backend/src/db/migrate.ts';
import {
	effectiveProjectRunCeiling,
	mayMutateProject,
} from '../../backend/src/services/run/launchMutation.ts';
import type { WebRunMode } from '../../backend/src/types.ts';

function makeCommands() {
	const sqlite = new Database(':memory:');
	migrateWebDatabase(sqlite);
	return wrapWebDatabase(sqlite).commands;
}

function runValues(id: string, projectPath: string, overrides: Record<string, unknown> = {}) {
	return {
		backend: 'native',
		id,
		mode: 'coding',
		projectName: 'proj',
		projectPath,
		source: 'web',
		startedAt: Date.now(),
		status: 'running',
		...overrides,
	};
}

const args = (
	id: string,
	projectPath: string,
	maxConcurrentRuns: number,
	maxConcurrentRunsPerProject: number,
) => ({ maxConcurrentRuns, maxConcurrentRunsPerProject, values: runValues(id, projectPath) });

// Mirrors exactly what launchRun hands the reservation: the operator's configured ceiling, run
// through the isolation/mutability clamp. Keeping the two in one shape is the point — a launch
// that skipped the clamp would admit a second writer into a shared checkout.
function admit(
	commands: ReturnType<typeof makeCommands>,
	input: { configured: number; id: string; isolated?: boolean; mode?: WebRunMode },
) {
	const isolated = input.isolated ?? false;
	const mode = input.mode ?? 'coding';
	return commands.insertRunIfUnderCeiling({
		maxConcurrentRuns: 10,
		maxConcurrentRunsPerProject: effectiveProjectRunCeiling({
			configured: input.configured,
			isolated,
			mutating: mayMutateProject(mode, {}),
		}),
		values: runValues(input.id, '/proj/a', {
			mode,
			worktreePath: isolated ? `/wt/${input.id}` : null,
		}),
	});
}

describe('insertRunIfUnderCeiling', () => {
	test('enforces the per-project ceiling even when the global pool has room', async () => {
		const commands = makeCommands();
		expect((await commands.insertRunIfUnderCeiling(args('r1', '/proj/a', 10, 2))).kind).toBe(
			'inserted',
		);
		expect((await commands.insertRunIfUnderCeiling(args('r2', '/proj/a', 10, 2))).kind).toBe(
			'inserted',
		);
		// Third run on the same project hits the per-project cap (global still has 8 free).
		expect(await commands.insertRunIfUnderCeiling(args('r3', '/proj/a', 10, 2))).toMatchObject({
			kind: 'rejected',
			limit: 2,
			scope: 'project',
		});
		// A different project still has room.
		expect((await commands.insertRunIfUnderCeiling(args('r4', '/proj/b', 10, 2))).kind).toBe(
			'inserted',
		);
	});

	test('enforces the global ceiling across projects', async () => {
		const commands = makeCommands();
		expect((await commands.insertRunIfUnderCeiling(args('r1', '/proj/a', 1, 5))).kind).toBe(
			'inserted',
		);
		expect(await commands.insertRunIfUnderCeiling(args('r2', '/proj/b', 1, 5))).toMatchObject({
			kind: 'rejected',
			limit: 1,
			scope: 'global',
		});
	});
});

describe('mayMutateProject', () => {
	test('classifies the modes that write to the project checkout', () => {
		for (const mode of [
			'audit',
			'coding',
			'interview',
			'todo',
			'triumvirate',
			'validate',
		] as WebRunMode[]) {
			expect(mayMutateProject(mode, {})).toBe(true);
		}
		expect(mayMutateProject('director', {})).toBe(false);
	});

	test('treats a directive as write-capable unless it opted into the read-only contract', () => {
		expect(mayMutateProject('directive', {})).toBe(true);
		expect(mayMutateProject('directive', { directiveReadonly: false })).toBe(true);
		expect(mayMutateProject('directive', { directiveReadonly: true })).toBe(false);
	});
});

describe('effectiveProjectRunCeiling', () => {
	test('clamps a non-isolated mutating launch to a single run per project', () => {
		expect(effectiveProjectRunCeiling({ configured: 4, isolated: false, mutating: true })).toBe(
			1,
		);
	});

	test('keeps the configured ceiling for isolated and read-only launches', () => {
		expect(effectiveProjectRunCeiling({ configured: 4, isolated: true, mutating: true })).toBe(
			4,
		);
		expect(
			effectiveProjectRunCeiling({ configured: 4, isolated: false, mutating: false }),
		).toBe(4);
	});

	test('only ever tightens: a configured ceiling of zero stays zero', () => {
		expect(effectiveProjectRunCeiling({ configured: 0, isolated: false, mutating: true })).toBe(
			0,
		);
	});
});

describe('admission through the mutation clamp', () => {
	test('simultaneous non-isolated mutating launches admit exactly one', async () => {
		const commands = makeCommands();
		const results = await Promise.all([
			admit(commands, { configured: 2, id: 'r1' }),
			admit(commands, { configured: 2, id: 'r2' }),
		]);

		expect(results.filter((result) => result.kind === 'inserted')).toHaveLength(1);
		expect(results.filter((result) => result.kind === 'rejected')).toEqual([
			{ activeCount: 1, kind: 'rejected', limit: 1, scope: 'project' },
		]);
	});

	test('worktree-isolated coding launches still reach the configured ceiling', async () => {
		const commands = makeCommands();
		expect((await admit(commands, { configured: 2, id: 'r1', isolated: true })).kind).toBe(
			'inserted',
		);
		expect((await admit(commands, { configured: 2, id: 'r2', isolated: true })).kind).toBe(
			'inserted',
		);
		// Refused by the operator's configured ceiling, not by the clamp.
		expect(await admit(commands, { configured: 2, id: 'r3', isolated: true })).toMatchObject({
			kind: 'rejected',
			limit: 2,
			scope: 'project',
		});
	});

	test('read-only launches keep the configured concurrency', async () => {
		const commands = makeCommands();
		expect((await admit(commands, { configured: 2, id: 'r1', mode: 'director' })).kind).toBe(
			'inserted',
		);
		expect((await admit(commands, { configured: 2, id: 'r2', mode: 'director' })).kind).toBe(
			'inserted',
		);
	});

	test.each(['audit', 'validate'] as const)(
		'%s cannot join an active coding checkout',
		async (mode) => {
			const commands = makeCommands();
			expect((await admit(commands, { configured: 2, id: 'coding' })).kind).toBe('inserted');
			expect(await admit(commands, { configured: 2, id: 'second', mode })).toMatchObject({
				kind: 'rejected',
				scope: 'project',
				limit: 1,
			});
		},
	);

	test('a mutating launch waits for a checkout that any other run still holds', async () => {
		const commands = makeCommands();
		expect((await admit(commands, { configured: 2, id: 'r1', mode: 'audit' })).kind).toBe(
			'inserted',
		);
		// The clamp counts every live run on the project, not just the mutating ones: an audit
		// reading the tree is exactly what a coding run would be editing underneath it.
		expect(await admit(commands, { configured: 2, id: 'r2' })).toMatchObject({
			kind: 'rejected',
			limit: 1,
			scope: 'project',
		});
	});
});
