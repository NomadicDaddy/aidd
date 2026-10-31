import { afterEach, describe, expect, test } from 'bun:test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AgentEvent, CLIBackend, PromptInput } from 'aidd-shared/backends/types';
import { classifyWebRun } from 'aidd-shared/runs/outcome';
import { removeTempTree } from '../../shared/src/lib/remove-temp-tree.ts';
import {
	committedContent,
	completeAndCommit,
	dirtyPath,
	howFor,
	makeProject,
	runBackend,
	runGit,
	runWith,
	teammateContent,
	tmpRoot,
} from './_helpers/pre-existing-paths-fixture.ts';

// A run must not revert, move or commit uncommitted work it did not make (#15994). These cover the
// harness half: keystrike iterations 136 and 137 replaced a teammate's file, ran the gate and put it
// back byte for byte, so run-end status looked untouched and no command-name list would have caught
// both spellings.

const slowTestTimeoutMs = 15_000;

afterEach(async () => {
	await removeTempTree(tmpRoot);
});

describe('paths already uncommitted when a run starts', () => {
	test(
		'a control the run leaves alone reports nothing',
		async () => {
			const store = await makeProject('control');
			const entry = await runWith(store, []);
			expect(entry.preExistingPathsChanged).toBeUndefined();
			expect(entry.summary).not.toContain('preexisting_paths_changed:');
			expect(entry.artifactWarnings ?? []).not.toContain('preexisting_paths_changed');
			expect(await readFile(join(store.projectDir, dirtyPath), 'utf8')).toBe(teammateContent);
		},
		slowTestTimeoutMs,
	);

	test(
		'replaced with HEAD through git show and cp, then restored byte for byte, is reported',
		async () => {
			const store = await makeProject('show-and-restore');
			const path = join(store.projectDir, dirtyPath);
			const entry = await runWith(store, [
				{
					act: async () => {
						await writeFile(`${path}.bak`, await readFile(path));
						const head = await runGit(store.projectDir, ['show', `HEAD:${dirtyPath}`]);
						await writeFile(path, head);
					},
				},
				{
					act: async () => {
						await writeFile(path, await readFile(`${path}.bak`));
					},
				},
			]);
			// Nothing differs by the end: only the check after the first call could see this.
			expect(await readFile(path, 'utf8')).toBe(teammateContent);
			expect(howFor(entry)).toContain('changed');
			expect(entry.summary).toContain('preexisting_paths_changed:');
			expect(entry.summary).toContain(dirtyPath);
			expect(entry.artifactWarnings).toContain('preexisting_paths_changed');
		},
		slowTestTimeoutMs,
	);

	test(
		'replaced and restored inside one tool call is still reported',
		async () => {
			const store = await makeProject('same-call');
			const path = join(store.projectDir, dirtyPath);
			const entry = await runWith(store, [
				{
					act: async () => {
						await writeFile(path, committedContent);
						await writeFile(path, teammateContent);
					},
				},
			]);
			expect(howFor(entry)).toEqual(['rewritten']);
		},
		slowTestTimeoutMs,
	);

	test(
		'reverted with git checkout is reported and turns the outcome amber',
		async () => {
			const store = await makeProject('checkout');
			const entry = await runWith(store, [
				{
					act: async () => {
						await runGit(store.projectDir, ['checkout', '--', dirtyPath]);
					},
				},
			]);
			expect(howFor(entry)).toContain('changed');
			const outcome = classifyWebRun({
				exitCode: entry.exitCode,
				status: 'completed',
				stopReason: entry.stopReason,
				summary: entry.summary,
			});
			expect(outcome.tone).toBe('amber');
			expect(outcome.label).toBe('Completed · existing work changed');
		},
		slowTestTimeoutMs,
	);

	test(
		'deleted is reported as removed',
		async () => {
			const store = await makeProject('removed');
			const entry = await runWith(store, [
				{
					act: async () => {
						await Bun.file(join(store.projectDir, dirtyPath)).delete();
					},
				},
			]);
			expect(howFor(entry)).toContain('removed');
		},
		slowTestTimeoutMs,
	);

	test(
		'committed by the run is reported, with the file on disk unchanged',
		async () => {
			const store = await makeProject('committed');
			const entry = await runWith(store, [
				{
					act: async () => {
						await runGit(store.projectDir, ['add', dirtyPath]);
						await runGit(store.projectDir, ['commit', '-m', 'carry the teammate file']);
					},
				},
			]);
			const hows = howFor(entry);
			expect(hows).toContain('staged');
			expect(hows).toContain('committed');
			expect(hows).not.toContain('changed');
		},
		slowTestTimeoutMs,
	);

	test(
		'staged and later unstaged is reported, with the file itself never changing',
		async () => {
			const store = await makeProject('staged');
			const entry = await runWith(store, [
				{
					act: async () => {
						await runGit(store.projectDir, ['add', dirtyPath]);
					},
				},
				{
					act: async () => {
						await runGit(store.projectDir, ['reset', '-q', '--', dirtyPath]);
					},
				},
			]);
			expect(howFor(entry)).toEqual(['staged']);
		},
		slowTestTimeoutMs,
	);

	test(
		'the next iteration is told, and only the iteration that changed the file is told about it',
		async () => {
			const store = await makeProject('next-prompt');
			await mkdir(join(store.metadataDir, 'features', 'feature-two'), { recursive: true });
			await writeFile(
				join(store.metadataDir, 'features', 'feature-two', 'feature.json'),
				JSON.stringify({
					id: 'feature-two',
					passes: false,
					priority: 2,
					status: 'backlog',
					title: 'Second feature',
				}),
			);
			const prompts: string[] = [];
			const backend: CLIBackend = {
				idleDefaults: { killMs: 5000, nudgeMs: 1000 },
				name: 'native',
				async *runPrompt(input: PromptInput): AsyncIterable<AgentEvent> {
					prompts.push(input.text);
					const id = prompts.length === 1 ? 'feature-core' : 'feature-two';
					yield { args: { command: 'x' }, tool: 'bash', type: 'tool_call' };
					if (id === 'feature-core') {
						await writeFile(join(store.projectDir, dirtyPath), committedContent);
					}
					await completeAndCommit(store, id);
					yield { result: 'ok', tool: 'bash', type: 'tool_result' };
					yield {
						chunk: `AIDD_RESULT: {"featureId":"${id}","status":"completed","passes":true}\n`,
						type: 'assistant_text',
					};
					yield { exitCode: 0, filesModified: [], type: 'done' };
				},
			};
			await runBackend(store, backend);
			expect(prompts).toHaveLength(2);
			expect(prompts[0]).not.toContain('Files you did not make have changed');
			expect(prompts[1]).toContain('Files you did not make have changed');
			expect(prompts[1]).toContain(dirtyPath);
		},
		slowTestTimeoutMs,
	);

	test(
		'the iteration record lists the change',
		async () => {
			const store = await makeProject('iteration-record');
			const path = join(store.projectDir, dirtyPath);
			await runWith(store, [
				{
					act: async () => {
						await writeFile(path, committedContent);
					},
				},
			]);
			const iterations = new Bun.Glob('*.json').scan({
				cwd: join(store.metadataDir, 'iterations'),
			});
			const recorded: unknown[] = [];
			for await (const name of iterations) {
				const record = JSON.parse(
					await readFile(join(store.metadataDir, 'iterations', name), 'utf8'),
				) as { preExistingPathsChanged?: unknown };
				if (record.preExistingPathsChanged !== undefined) {
					recorded.push(record.preExistingPathsChanged);
				}
			}
			expect(recorded).toEqual([[{ how: 'changed', path: dirtyPath }]]);
		},
		slowTestTimeoutMs,
	);
});
