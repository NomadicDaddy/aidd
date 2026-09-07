import type { AgentEvent, CLIBackend, PromptInput } from 'aidd-shared/backends/types';

import { afterEach, describe, expect, test } from 'bun:test';
import { unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { createMergeResolver } from '../../cli/src/orchestrator/run/merge-resolver.ts';
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

async function repository(conflicted: boolean): Promise<string> {
	const root = await testTempDir('aidd-merge-resolver-');
	roots.push(root);
	git(root, 'init');
	git(root, 'config', 'user.email', 'test@example.com');
	git(root, 'config', 'user.name', 'aidd test');
	await writeFile(join(root, 'shared.txt'), 'base\n');
	git(root, 'add', '.');
	git(root, 'commit', '-m', 'base');
	if (!conflicted) return root;
	git(root, 'switch', '-c', 'aidd/run-test');
	await writeFile(join(root, 'shared.txt'), 'run branch\n');
	git(root, 'commit', '-am', 'run');
	git(root, 'switch', '-');
	await writeFile(join(root, 'shared.txt'), 'main branch\n');
	git(root, 'commit', '-am', 'main');
	const merge = Bun.spawnSync(['git', '-C', root, 'merge', 'aidd/run-test'], {
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	expect(merge.exitCode).not.toBe(0);
	return root;
}

function backend(
	invocations: PromptInput[],
	action: (input: PromptInput) => AsyncIterable<AgentEvent>,
): CLIBackend {
	return {
		idleDefaults: { killMs: 5_000, nudgeMs: 4_000 },
		name: 'native',
		runPrompt(input) {
			invocations.push(input);
			return action(input);
		},
	};
}

async function* done(exitCode = 0): AsyncIterable<AgentEvent> {
	yield { exitCode, filesModified: [], type: 'done' };
}

function resolverFor(
	invocations: PromptInput[],
	action: (input: PromptInput) => AsyncIterable<AgentEvent>,
) {
	return createMergeResolver({
		backend: backend(invocations, action),
		reasoningEffort: 'high',
		simulation: false,
	});
}

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => removeTempTree(root)));
});

describe('AI merge conflict resolver', () => {
	test('does not invoke the backend when there are no unmerged paths', async () => {
		const root = await repository(false);
		const invocations: PromptInput[] = [];
		expect(await resolverFor(invocations, () => done())(root, 'aidd/run-test')).toBe(false);
		expect(invocations).toEqual([]);
	});

	test('fails closed when the backend iterator throws', async () => {
		const root = await repository(true);
		async function* throws(): AsyncIterable<AgentEvent> {
			yield await Promise.reject<AgentEvent>(new Error('backend failed'));
		}
		expect(await resolverFor([], throws)(root, 'aidd/run-test')).toBe(false);
	});

	test('fails closed when the backend exits unsuccessfully', async () => {
		const root = await repository(true);
		expect(await resolverFor([], () => done(1))(root, 'aidd/run-test')).toBe(false);
	});

	test('fails closed when a successful backend leaves MERGE_HEAD', async () => {
		const root = await repository(true);
		expect(await resolverFor([], () => done())(root, 'aidd/run-test')).toBe(false);
	});

	test('fails closed when MERGE_HEAD is gone but unmerged paths remain', async () => {
		const root = await repository(true);
		async function* removesMergeHead(): AsyncIterable<AgentEvent> {
			await unlink(join(root, '.git', 'MERGE_HEAD'));
			yield* done();
		}
		expect(await resolverFor([], removesMergeHead)(root, 'aidd/run-test')).toBe(false);
	});

	test('returns true only after the backend resolves and commits every path', async () => {
		const root = await repository(true);
		const invocations: PromptInput[] = [];
		async function* resolves(): AsyncIterable<AgentEvent> {
			await writeFile(join(root, 'shared.txt'), 'combined intent\n');
			git(root, 'add', 'shared.txt');
			git(root, 'commit', '--no-edit');
			yield* done();
		}
		expect(await resolverFor(invocations, resolves)(root, 'aidd/run-test')).toBe(true);
		expect(invocations[0]?.text).toContain('- shared.txt');
		expect(invocations[0]?.text).toContain('git commit --no-edit');
	});
});
