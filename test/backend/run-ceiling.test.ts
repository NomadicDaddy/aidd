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
		...overrides,
	};
}

async function queueAndPromote(
	commands: ReturnType<typeof makeCommands>,
	input: {
		configured: number;
		id: string;
		isolated?: boolean;
		maxConcurrentRuns?: number;
		mode?: WebRunMode;
		projectPath?: string;
	},
) {
	await commands.insertQueuedRun({
		values: runValues(input.id, input.projectPath ?? '/proj/a', {
			mode: input.mode ?? 'coding',
		}),
	});
	return commands.promoteOldestQueuedRun({
		dataDir: '/data',
		maxConcurrentRuns: input.maxConcurrentRuns ?? 10,
		maxConcurrentRunsPerProject: input.configured,
		useWorktrees: input.isolated === true,
	});
}

describe('queued admission', () => {
	test('enforces the per-project ceiling even when the global pool has room', async () => {
		const commands = makeCommands();
		expect(
			(await queueAndPromote(commands, { configured: 2, id: 'r1', isolated: true })).kind,
		).toBe('promoted');
		expect(
			(await queueAndPromote(commands, { configured: 2, id: 'r2', isolated: true })).kind,
		).toBe('promoted');
		expect(
			await queueAndPromote(commands, { configured: 2, id: 'r3', isolated: true }),
		).toEqual({ kind: 'none' });
		expect(
			(
				await queueAndPromote(commands, {
					configured: 2,
					id: 'r4',
					isolated: true,
					projectPath: '/proj/b',
				})
			).kind,
		).toBe('promoted');
	});

	test('enforces the global ceiling across projects', async () => {
		const commands = makeCommands();
		expect(
			(await queueAndPromote(commands, { configured: 5, id: 'r1', maxConcurrentRuns: 1 }))
				.kind,
		).toBe('promoted');
		expect(
			await queueAndPromote(commands, {
				configured: 5,
				id: 'r2',
				maxConcurrentRuns: 1,
				projectPath: '/proj/b',
			}),
		).toEqual({ kind: 'none' });
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
			queueAndPromote(commands, { configured: 2, id: 'r1' }),
			queueAndPromote(commands, { configured: 2, id: 'r2' }),
		]);
		expect(results.filter((result) => result.kind === 'promoted')).toHaveLength(1);
		expect(results.filter((result) => result.kind === 'none')).toHaveLength(1);
	});

	test('worktree-isolated coding launches still reach the configured ceiling', async () => {
		const commands = makeCommands();
		expect(
			(await queueAndPromote(commands, { configured: 2, id: 'r1', isolated: true })).kind,
		).toBe('promoted');
		expect(
			(await queueAndPromote(commands, { configured: 2, id: 'r2', isolated: true })).kind,
		).toBe('promoted');
		expect(
			await queueAndPromote(commands, { configured: 2, id: 'r3', isolated: true }),
		).toEqual({ kind: 'none' });
	});

	test('read-only launches keep the configured concurrency', async () => {
		const commands = makeCommands();
		expect(
			(await queueAndPromote(commands, { configured: 2, id: 'r1', mode: 'director' })).kind,
		).toBe('promoted');
		expect(
			(await queueAndPromote(commands, { configured: 2, id: 'r2', mode: 'director' })).kind,
		).toBe('promoted');
	});

	test.each(['audit', 'validate'] as const)(
		'%s cannot join an active coding checkout',
		async (mode) => {
			const commands = makeCommands();
			expect((await queueAndPromote(commands, { configured: 2, id: 'coding' })).kind).toBe(
				'promoted',
			);
			expect(await queueAndPromote(commands, { configured: 2, id: 'second', mode })).toEqual({
				kind: 'none',
			});
		},
	);

	test('a mutating launch waits for a checkout that any other run still holds', async () => {
		const commands = makeCommands();
		expect(
			(await queueAndPromote(commands, { configured: 2, id: 'r1', mode: 'audit' })).kind,
		).toBe('promoted');
		expect(await queueAndPromote(commands, { configured: 2, id: 'r2' })).toEqual({
			kind: 'none',
		});
	});
});
