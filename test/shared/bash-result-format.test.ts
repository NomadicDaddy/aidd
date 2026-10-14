import { describe, expect, test } from 'bun:test';

import { maxCommandOutputChars } from '../../shared/src/agent/tools/constants.ts';
import { formatBashResult } from '../../shared/src/agent/tools/shell.ts';

// The whole result used to be truncated after the diagnostics were appended, so a command whose
// output filled the bound lost its abort reason, cleanup warning and exit code (roger, review of
// acdb6fb4). Only the command's own output is trimmed now.

const errors = [
	'ERROR: Command aborted: stop requested',
	'WARNING: cleanup incomplete: still running after the kill: pid 4102',
];

describe('formatBashResult', () => {
	test('keeps every diagnostic when the output fills the bound', () => {
		const result = formatBashResult(
			{ stderr: '', stdout: 'a'.repeat(maxCommandOutputChars) },
			errors,
			'aborted',
		);
		expect(result).toContain('output truncated at 50000 chars');
		for (const error of errors) expect(result).toContain(error);
		expect(result.endsWith('\n[exit code: aborted]')).toBe(true);
		expect(result.length).toBeLessThanOrEqual(maxCommandOutputChars + 64);
	});

	test('keeps the familiar shape for small output', () => {
		expect(formatBashResult({ stderr: 'warn', stdout: 'ok' }, [], 0)).toBe(
			'ok\nSTDERR:\nwarn\n[exit code: 0]',
		);
		expect(formatBashResult({ stderr: '', stdout: '' }, [errors[0] ?? ''], 'aborted')).toBe(
			'ERROR: Command aborted: stop requested\n[exit code: aborted]',
		);
		expect(formatBashResult({ stderr: '', stdout: '' }, [], 0)).toBe('\n[exit code: 0]');
	});
});
