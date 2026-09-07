import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';

import { authTokenDialogReadiness } from '../../frontend/src/components/shared/authTokenDialogReadiness.ts';

const srcRoot = join(process.cwd(), 'frontend', 'src');

function read(path: string): Promise<string> {
	return Bun.file(join(srcRoot, ...path.split('/'))).text();
}

describe('global dialog initial focus', () => {
	test('lets the Director chat name its composer as the primary task control', async () => {
		const [dialog, directorChat] = await Promise.all([
			read('components/ui/dialog.tsx'),
			read('components/shared/DirectorChatModal.tsx'),
		]);

		expect(dialog).toContain('initialFocusRef?.current ??');
		expect(directorChat).toContain('initialFocusRef={composerRef}');
		expect(directorChat).toContain('composerRef={composerRef}');
	});
});

describe('access-token action readiness', () => {
	test('keeps both actions disabled when the visible form and stored token are empty', () => {
		expect(authTokenDialogReadiness('', '', false)).toEqual({
			clearDisabled: true,
			saveDisabled: true,
		});
		expect(authTokenDialogReadiness('   ', '', false)).toEqual({
			clearDisabled: true,
			saveDisabled: true,
		});
	});

	test('enables Save only for a non-empty normalized change', () => {
		expect(authTokenDialogReadiness(' current-token ', 'current-token', false)).toEqual({
			clearDisabled: false,
			saveDisabled: true,
		});
		expect(authTokenDialogReadiness(' replacement-token ', 'current-token', false)).toEqual({
			clearDisabled: false,
			saveDisabled: false,
		});
	});

	test('keeps Clear tied to persisted state and blocks both actions during verification', () => {
		expect(authTokenDialogReadiness('new-token', '', false)).toEqual({
			clearDisabled: true,
			saveDisabled: false,
		});
		expect(authTokenDialogReadiness('new-token', 'current-token', true)).toEqual({
			clearDisabled: true,
			saveDisabled: true,
		});
	});
});
