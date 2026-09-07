import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

import type { TelegramChannelSettings } from '../../frontend/src/api/types/settings.ts';

import {
	clearTelegramTokenDraft,
	telegramTokenPendingAction,
	updateTelegramTokenDraft,
} from '../../frontend/src/pages/settings/telegramTokenDraft.ts';

const FRONTEND_ROOT = resolve(import.meta.dir, '../../frontend');

function storedTelegram(): TelegramChannelSettings {
	return { allowedChatIds: [123], botTokenConfigured: true };
}

function renderTelegram(telegram: TelegramChannelSettings): string {
	const script = [
		"import { createElement } from 'react';",
		"import { renderToStaticMarkup } from 'react-dom/server';",
		"import { TelegramChannelSection } from './src/pages/settings/TelegramChannelSection.tsx';",
		"import { createBlankSettings } from './src/pages/settings/settingsUtils.ts';",
		`const form = { ...createBlankSettings(), telegram: ${JSON.stringify(telegram)} };`,
		'console.log(renderToStaticMarkup(createElement(TelegramChannelSection, { form, setField: () => undefined })));',
	].join('\n');
	const result = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: FRONTEND_ROOT,
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
	return new TextDecoder().decode(result.stdout).trim();
}

describe('Telegram token clearing semantics', () => {
	test('treats an emptied replacement as preserve rather than clear', () => {
		const stored = storedTelegram();
		const replacement = updateTelegramTokenDraft(stored, '  replacement-value  ');

		expect(replacement.botToken).toBe('replacement-value');
		expect(telegramTokenPendingAction(replacement)).toBe('replace');

		const emptied = updateTelegramTokenDraft(replacement, '   ');
		expect(emptied).toEqual(stored);
		expect(Object.hasOwn(emptied, 'botToken')).toBe(false);
		expect(telegramTokenPendingAction(emptied)).toBeUndefined();
	});

	test('reserves null for an explicit pending clear', () => {
		const cleared = clearTelegramTokenDraft(storedTelegram());

		expect(cleared.botToken).toBeNull();
		expect(telegramTokenPendingAction(cleared)).toBe('clear');
		expect(updateTelegramTokenDraft(cleared, '')).toEqual(storedTelegram());
	});

	test('distinguishes a first token from replacing a stored token', () => {
		const firstToken = updateTelegramTokenDraft(
			{ allowedChatIds: [], botTokenConfigured: false },
			'first-value',
		);

		expect(telegramTokenPendingAction(firstToken)).toBe('set');
		expect(telegramTokenPendingAction(updateTelegramTokenDraft(storedTelegram(), 'next'))).toBe(
			'replace',
		);
	});

	test('renders configured, pending-clear, and reversible clear states truthfully', () => {
		const configuredHtml = renderTelegram(storedTelegram());
		const pendingClearHtml = renderTelegram(clearTelegramTokenDraft(storedTelegram()));

		expect(configuredHtml).toContain('>Configured</span>');
		expect(configuredHtml).toContain('>Clear stored token</button>');
		expect(configuredHtml).not.toContain('Will clear on save');

		expect(pendingClearHtml).toContain('>Will clear on save</span>');
		expect(pendingClearHtml).toContain('>Keep stored token</button>');
		expect(pendingClearHtml).not.toContain('>Configured</span>');
	});
});
