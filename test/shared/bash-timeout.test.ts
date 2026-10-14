import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { maxToolTimeoutMs } from '../../shared/src/agent/tools/constants.ts';
import { toolDefinitions } from '../../shared/src/agent/tools/definitions.ts';
import { runBash } from '../../shared/src/agent/tools/shell.ts';
import { testTempDirSync } from '../_helpers/temp.ts';

// timeout_ms reached the timer unchecked: 0, -1 and Infinity fired it at once (with Node's
// negative and overflow warnings) and a huge value outlived the idle monitor. An invalid value is
// refused before the command is spawned; an omitted one keeps the default.
const cwd = testTempDirSync('bash-timeout');

describe('bash timeout_ms validation', () => {
	for (const [label, value] of [
		['zero', 0],
		['negative', -1],
		['NaN', Number.NaN],
		['Infinity', Number.POSITIVE_INFINITY],
		['a string', '5000'],
	] as const) {
		test(`refuses ${label} before spawning`, async () => {
			const marker = join(cwd, `spawned-${label.replace(/\s/g, '-')}`);
			const result = await runBash({ command: `touch '${marker}'`, timeout_ms: value }, cwd);
			expect(result).toBe(
				'ERROR: timeout_ms must be a positive, finite number of milliseconds',
			);
			expect(existsSync(marker)).toBe(false);
		});
	}

	test('refuses a value above the ceiling before spawning', async () => {
		const marker = join(cwd, 'spawned-overflow');
		const result = await runBash(
			{ command: `touch '${marker}'`, timeout_ms: maxToolTimeoutMs + 1 },
			cwd,
		);
		expect(result).toBe(`ERROR: timeout_ms must not exceed ${maxToolTimeoutMs}ms`);
		expect(existsSync(marker)).toBe(false);
	});

	test('accepts the ceiling itself', async () => {
		const result = await runBash({ command: 'echo ok', timeout_ms: maxToolTimeoutMs }, cwd);
		expect(result).toBe('ok\n\n[exit code: 0]');
	});

	test('keeps the default when timeout_ms is omitted', async () => {
		const result = await runBash({ command: 'echo ok' }, cwd);
		expect(result).toBe('ok\n\n[exit code: 0]');
	});

	test('an ordinary in-range timeout still bounds the command', async () => {
		const result = await runBash({ command: 'sleep 10', timeout_ms: 300 }, cwd);
		expect(result).toContain('ERROR: Command timed out after 300ms');
		expect(result).toContain('[exit code: timeout]');
	}, 15_000);

	test('the tool schema advertises the same bounds', () => {
		const bash = toolDefinitions.find((tool) => tool.function.name === 'bash');
		const parameters = bash?.function.parameters as {
			properties: { timeout_ms: { exclusiveMinimum: number; maximum: number } };
		};
		expect(parameters.properties.timeout_ms.exclusiveMinimum).toBe(0);
		expect(parameters.properties.timeout_ms.maximum).toBe(maxToolTimeoutMs);
	});
});
