import { describe, expect, test } from 'bun:test';

import type { WriteViolation } from '../../shared/src/pipeline/write-allowlist/types.ts';

import { describeWriteGuardRevert } from '../../shared/src/pipeline/write-allowlist/describe.ts';

function violation(path: string, overrides: Partial<WriteViolation> = {}): WriteViolation {
	return {
		committed: false,
		destructivelyDiscarded: false,
		path,
		untracked: false,
		...overrides,
	};
}

describe('describeWriteGuardRevert', () => {
	test('says writes were reverted when every revert succeeded', () => {
		expect(describeWriteGuardRevert([violation('src/a.ts')], [], 'isolated')).toBe(
			'writes reverted',
		);
	});

	test('names the paths a failed revert left dirty', () => {
		expect(describeWriteGuardRevert([violation('src/a.ts')], ['src/a.ts'], 'isolated')).toBe(
			'REVERT FAILED, still dirty: src/a.ts',
		);
	});

	// The checkout that "reverts" a discarded path succeeds and restores nothing, so the old
	// message told the operator their work was back when it was gone.
	test('does not call discarded uncommitted edits reverted', () => {
		const text = describeWriteGuardRevert(
			[violation('notes.md', { destructivelyDiscarded: true })],
			[],
			'isolated',
		);
		expect(text).not.toContain('writes reverted');
		expect(text).toContain('NOT restored');
		expect(text).toContain('notes.md');
	});

	test('reports both when a run wrote one path and discarded another', () => {
		const text = describeWriteGuardRevert(
			[violation('src/a.ts'), violation('notes.md', { destructivelyDiscarded: true })],
			[],
			'isolated',
		);
		expect(text).toBe(
			'writes reverted; uncommitted edits were discarded and are NOT restored (the committed version is in place): notes.md',
		);
	});

	test('truncates a long path list', () => {
		const many = Array.from({ length: 10 }, (_, index) => `f${String(index)}.ts`);
		expect(
			describeWriteGuardRevert(
				many.map((path) => violation(path)),
				many,
				'isolated',
				8,
			),
		).toContain('… and 2 more');
	});

	// The live project tree is shared with the operator and other agents, so nothing is reverted
	// there and the text has to say so: the reader decides which of the paths are theirs.
	test('says the paths were left in place in a shared checkout, and why', () => {
		const text = describeWriteGuardRevert([violation('src/a.ts')], ['src/a.ts'], 'shared');
		expect(text).toContain('NOT reverted');
		expect(text).toContain('shared');
		expect(text).toContain('src/a.ts');
		expect(text).not.toContain('writes reverted');
		expect(text).not.toContain('REVERT FAILED');
	});

	test('still reports discarded edits as lost in a shared checkout', () => {
		const text = describeWriteGuardRevert(
			[violation('src/a.ts'), violation('notes.md', { destructivelyDiscarded: true })],
			['src/a.ts', 'notes.md'],
			'shared',
		);
		expect(text).toContain('NOT reverted, left as they are');
		expect(text).toContain('NOT restored');
		expect(text).toContain('notes.md');
	});
});
