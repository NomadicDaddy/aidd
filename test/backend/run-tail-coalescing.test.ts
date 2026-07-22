import { appendFile, open, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { RunTailWatcher } from '../../backend/src/services/run/tailWatcher.ts';
import { WebSocketHub } from '../../backend/src/webSocketHub.ts';

import { testTempDir } from '../_helpers/temp.ts';
interface CapturedOutput {
	chunk: string;
	runId: string;
	type: string;
}

function captureHub(): { hub: WebSocketHub; outputs: CapturedOutput[] } {
	const outputs: CapturedOutput[] = [];
	const hub = new WebSocketHub();
	hub.add({
		send: (data: string) => {
			const message = JSON.parse(data) as {
				payload?: { chunk?: unknown };
				runId?: unknown;
				type?: unknown;
			};
			if (message.type !== 'run_output') return;
			outputs.push({
				chunk: String(message.payload?.chunk ?? ''),
				runId: String(message.runId ?? ''),
				type: String(message.type),
			});
		},
	});
	return { hub, outputs };
}

describe('RunTailWatcher broadcast coalescing', () => {
	let dir: string;

	beforeEach(async () => {
		dir = await testTempDir('aidd-tail-');
	});

	afterEach(async () => {
		await rm(dir, { force: true, recursive: true });
	});

	test('emits one coalesced frame per drain and never drops bytes', async () => {
		const logPath = join(dir, 'run.log');
		await writeFile(logPath, 'line1\n');
		const { hub, outputs } = captureHub();

		// start() performs the initial drain: all existing bytes ship as a single frame.
		const tail = await RunTailWatcher.start('run_tail_1', logPath, hub);
		expect(outputs).toHaveLength(1);
		expect(outputs[0]?.chunk).toBe('line1\n');

		// Append more, then stop() — which drains and flushes any remaining buffer — so the test
		// is deterministic regardless of fs.watch timing.
		await appendFile(logPath, 'line2\nline3\n');
		await tail.stop();

		const combined = outputs.map((output) => output.chunk).join('');
		expect(combined).toBe('line1\nline2\nline3\n');
	});

	test('poll fallback broadcasts bytes appended through a persistent writer handle', async () => {
		const logPath = join(dir, 'run.log');
		await writeFile(logPath, '');
		const { hub, outputs } = captureHub();

		// Mirror the CLI heartbeat: one writer handle held open across appends. On Windows such
		// writes update no directory metadata until the handle closes, so fs.watch stays silent
		// and the poll is the only signal (the bug this guards against: a live console frozen
		// for the whole run). Tight pollMs keeps the test fast.
		const writer = await open(logPath, 'a');
		const tail = await RunTailWatcher.start('run_tail_poll', logPath, hub, { pollMs: 25 });
		try {
			await writer.write('streamed\n');
			const deadline = Date.now() + 5_000;
			while (outputs.length === 0 && Date.now() < deadline) {
				await new Promise((resolve) => setTimeout(resolve, 25));
			}
			const combined = outputs.map((output) => output.chunk).join('');
			expect(combined).toBe('streamed\n');
		} finally {
			await tail.stop();
			await writer.close();
		}
	});
});
