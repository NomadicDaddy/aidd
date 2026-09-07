import { describe, expect, test } from 'bun:test';

import { runBackend } from '../../backend/src/app.ts';

async function captureRunBackend(argv: string[]): Promise<{ code: number; output: string }> {
	const originalLog = console.log;
	const lines: string[] = [];
	console.log = (message?: unknown, ...optionalParams: unknown[]): void => {
		lines.push([message, ...optionalParams].map((item) => String(item)).join(' '));
	};
	try {
		const result = await Promise.race([
			runBackend(argv),
			Bun.sleep(1_000).then(() => 'timeout'),
		]);
		if (typeof result !== 'number') {
			throw new Error(`runBackend(${argv.join(' ')}) timed out`);
		}
		return { code: result, output: lines.join('\n') };
	} finally {
		console.log = originalLog;
	}
}

describe('aidd-web entrypoint', () => {
	test('--help exits before server startup', async () => {
		const result = await captureRunBackend(['--help']);

		expect(result.code).toBe(0);
		expect(result.output).toContain('Usage: aidd-web');
		expect(result.output).toContain('--version');
	});

	test('--version exits before server startup', async () => {
		const result = await captureRunBackend(['--version']);

		expect(result.code).toBe(0);
		expect(result.output).toMatch(/^aidd-web v\d+\.\d+\.\d+/);
	});
});
