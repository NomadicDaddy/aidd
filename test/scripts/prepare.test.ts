import { describe, expect, test } from 'bun:test';

import { prepareRepository } from '../../scripts/prepare.ts';

describe('prepareRepository', () => {
	test('does nothing for a source package outside a Git checkout', () => {
		const calls: string[][] = [];
		const result = prepareRepository('D:/package', (command) => {
			calls.push(command);
			return { exitCode: 128, stderr: 'fatal: not a git repository' };
		});
		expect(result).toBe(0);
		expect(calls).toEqual([['git', 'rev-parse', '--is-inside-work-tree']]);
	});

	test('propagates a hook setup failure from a real checkout', () => {
		const calls: string[][] = [];
		const result = prepareRepository('D:/checkout', (command) => {
			calls.push(command);
			if (command[0] === 'bun') return { exitCode: 9, stderr: 'setup refused' };
			return { exitCode: 0, stderr: '' };
		});
		expect(result).toBe(1);
		expect(calls).toEqual([
			['git', 'rev-parse', '--is-inside-work-tree'],
			['git', 'config', 'core.hooksPath', '.githooks'],
			['bun', './scripts/run-bash.ts', '.githooks/leak-guard-setup.sh'],
		]);
	});
});
