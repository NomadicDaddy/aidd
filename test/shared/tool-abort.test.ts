import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import type { AgentClient } from '../../shared/src/agent/client.ts';
import type { AgentEvent } from '../../shared/src/backends/types.ts';

import { runAgentLoop } from '../../shared/src/agent/loop.ts';
import { executeTool } from '../../shared/src/agent/tools/index.ts';
import { runBash } from '../../shared/src/agent/tools/shell.ts';
import { testTempDirSync } from '../_helpers/temp.ts';

// Aborting the native loop used to stop only the provider request: an in-flight tool subprocess
// ran on to its own timeout. The signal now reaches the subprocess, the whole tree dies, and the
// loop records the tool's result before its aborted terminal event.

// The root and a background descendant each write a marker two seconds in. A tree that was
// really killed leaves neither behind.
const treeCommand =
	'touch started && (sleep 2 && touch late-child) & sleep 2 && touch late-root; wait';

async function waitForFile(path: string, timeoutMs = 10_000): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (!existsSync(path)) {
		if (Date.now() > deadline) throw new Error(`timed out waiting for ${path}`);
		await sleep(25);
	}
}

async function expectTreeGone(cwd: string): Promise<void> {
	await sleep(3500);
	expect(existsSync(join(cwd, 'late-root'))).toBe(false);
	expect(existsSync(join(cwd, 'late-child'))).toBe(false);
}

describe('tool cancellation', () => {
	test('aborting kills a running bash command and its descendants', async () => {
		const cwd = testTempDirSync('tool-abort-bash');
		const controller = new AbortController();
		const pending = runBash({ command: treeCommand }, cwd, controller.signal);
		await waitForFile(join(cwd, 'started'));
		const abortedAt = Date.now();
		controller.abort('stop requested');

		const result = await pending;
		expect(Date.now() - abortedAt).toBeLessThan(2000);
		expect(result).toContain('ERROR: Command aborted: stop requested');
		expect(result).toContain('[exit code: aborted]');
		expect(result).not.toContain('cleanup incomplete');
		await expectTreeGone(cwd);
	}, 20_000);

	test('an already-aborted signal never spawns the command', async () => {
		const cwd = testTempDirSync('tool-abort-pre');
		const controller = new AbortController();
		controller.abort('stop requested');
		const result = await executeTool(
			'bash',
			JSON.stringify({ command: 'touch spawned' }),
			cwd,
			false,
			controller.signal,
		);
		expect(result).toBe('ERROR: Command aborted before it started: stop requested');
		expect(existsSync(join(cwd, 'spawned'))).toBe(false);
	});

	test('an already-aborted signal never spawns grep', async () => {
		const cwd = testTempDirSync('tool-abort-grep');
		const controller = new AbortController();
		controller.abort(new Error('run stopped'));
		const result = await executeTool(
			'grep',
			JSON.stringify({ pattern: 'anything' }),
			cwd,
			false,
			controller.signal,
		);
		expect(result).toBe('ERROR: grep aborted before it started: run stopped');
	});

	test('the loop reports the aborted tool result, then ends aborted', async () => {
		const cwd = testTempDirSync('tool-abort-loop');
		const controller = new AbortController();
		let completions = 0;
		const client: AgentClient = {
			async complete() {
				completions += 1;
				return {
					text: '',
					toolCalls: [
						{
							arguments: JSON.stringify({ command: treeCommand }),
							id: 'call_1',
							name: 'bash',
						},
						{
							arguments: JSON.stringify({ command: 'touch second' }),
							id: 'call_2',
							name: 'bash',
						},
					],
				};
			},
		};
		void waitForFile(join(cwd, 'started')).then(() => controller.abort('stop requested'));

		const events: AgentEvent[] = [];
		for await (const event of runAgentLoop(
			{ cwd, text: 'Run the long command.' },
			{ client, signal: controller.signal },
		)) {
			events.push(event);
		}

		expect(completions).toBe(1);
		expect(events.map((event) => event.type)).toEqual([
			'tool_call',
			'tool_result',
			'error',
			'done',
		]);
		const toolResult = events[1];
		expect(toolResult?.type === 'tool_result' && toolResult.tool).toBe('bash');
		expect(toolResult?.type === 'tool_result' ? toolResult.result : '').toContain(
			'ERROR: Command aborted: stop requested',
		);
		expect(events.slice(2)).toEqual([
			{ meta: 'stop requested', reason: 'aborted', type: 'error' },
			{ exitCode: 6, filesModified: [], type: 'done' },
		]);
		expect(existsSync(join(cwd, 'second'))).toBe(false);
		await expectTreeGone(cwd);
	}, 20_000);
});
