import { describe, expect, test } from 'bun:test';

import { normalizePromptPath } from '../../cli/src/prompts/compile/shared.ts';

// Guards the lazy/crash-safe bash-prefix refactor: path translation must still work, and resolving
// the prefix must never throw even where `bash` is absent (a clean Windows box with no Git Bash/WSL).
describe('normalizePromptPath', () => {
	test('translates a Windows drive path to a bash-style path', () => {
		expect(normalizePromptPath('C:\\foo\\bar')).toMatch(/^\/(mnt\/)?c\/foo\/bar$/);
	});

	test('lowercases the drive letter and folds backslashes', () => {
		expect(normalizePromptPath('D:\\Apps\\aidd')).toMatch(/^\/(mnt\/)?d\/Apps\/aidd$/);
	});

	test('passes through non-drive paths unchanged (slashified)', () => {
		expect(normalizePromptPath('relative\\path')).toBe('relative/path');
		expect(normalizePromptPath('/already/posix')).toBe('/already/posix');
	});
});
