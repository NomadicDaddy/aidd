import { describe, expect, test } from 'bun:test';
import { join, resolve } from 'node:path';

const FRONTEND_ROOT = resolve(import.meta.dir, '../../frontend');

function read(...segments: string[]): Promise<string> {
	return Bun.file(join(FRONTEND_ROOT, 'src', ...segments)).text();
}

function renderChatSection(): string {
	const sessions = [
		{ id: 'chat_1', title: 'Director Chat', updatedAt: Date.UTC(2026, 7, 18, 12) },
		{ id: 'chat_2', title: 'Director Chat', updatedAt: Date.UTC(2026, 7, 18, 13) },
		{ id: 'chat_3', title: 'Fleet priorities', updatedAt: Date.UTC(2026, 7, 18, 14) },
	];
	const script = [
		"import { createElement } from 'react';",
		"import { renderToStaticMarkup } from 'react-dom/server';",
		"import { MemoryRouter } from 'react-router';",
		"import { DirectorChatSection } from './src/pages/director/DirectorChatSection.tsx';",
		`const sessions = ${JSON.stringify(sessions)};`,
		'const noop = () => undefined;',
		'const section = createElement(DirectorChatSection, {',
		" activeSessionId: 'chat_1', chatInput: ['First line', 'Second line'].join(String.fromCharCode(10)),",
		' createPending: false, deletePending: false, deleteSession: undefined,',
		' isMobileLayout: false, messages: [], onChatInputChange: noop,',
		' onCloseDeleteSession: noop, onConfirmDeleteSession: noop,',
		' onRequestDeleteSession: noop, onSelectSession: noop, onSendMessage: noop,',
		' onStartSession: noop, pendingContent: null, sendPending: false, sessions',
		'});',
		'console.log(JSON.stringify(renderToStaticMarkup(createElement(MemoryRouter, null, section))));',
	].join('\n');
	const result = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: FRONTEND_ROOT,
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
	return JSON.parse(new TextDecoder().decode(result.stdout).trim()) as string;
}

describe('Director workspace local design contracts', () => {
	test('the operational workflow leads the DOM and all cards use the column measure', async () => {
		const [page, suggestions] = await Promise.all([
			read('pages', 'director', 'DirectorPage.tsx'),
			read('pages', 'director', 'DirectorSuggestions.tsx'),
		]);

		expect(page.indexOf('<DirectorSuggestionsList')).toBeLessThan(
			page.indexOf('<DirectorRecentCycles'),
		);
		expect(page.indexOf('<DirectorRecentCycles')).toBeLessThan(
			page.indexOf('<DirectorChatSection'),
		);
		expect(page).toContain('@min-[68rem]:grid-cols-[minmax(0,3fr)_minmax(28rem,2fr)]');
		expect(suggestions).toContain('<Card>');
		expect(suggestions).not.toContain('max-w-[66rem]');
	});

	test('recent cycles and filtered suggestions state their honest totals', async () => {
		const [cycles, filters, suggestions] = await Promise.all([
			read('pages', 'director', 'DirectorRecentCycles.tsx'),
			read('pages', 'director', 'DirectorSuggestionFilters.tsx'),
			read('pages', 'director', 'DirectorSuggestions.tsx'),
		]);

		expect(cycles).toContain("cycles.length === 1 ? 'cycle' : 'cycles'");
		expect(filters).toContain('Showing {displayedCount} of {totalCount}');
		expect(suggestions).toContain('totalCount={filteredSuggestions.length}');
		expect(suggestions).toContain('const openCount = visibleSuggestions.filter(');
		expect(cycles).toContain('<MetaItem separated>');
		expect(cycles).not.toContain('<span aria-hidden="true">·</span>\n\t\t\t\t<MetaItem>');
	});

	test('default sessions remain distinguishable and the composer accepts line breaks', () => {
		const html = renderChatSection();

		expect(
			html.match(/<div class="truncate font-medium max-sm:flex-1">New chat ·/gu),
		).toHaveLength(2);
		expect(html).toContain('Fleet priorities');
		expect(html).toContain('<textarea');
		expect(html).toContain(['First line', 'Second line'].join(String.fromCharCode(10)));
		expect(html).toContain('>Shift</kbd>');
		expect(html).toContain('>+</span>');
		expect(html).toContain('aria-describedby="director-chat-composer-hint"');
	});

	test('one composer contract serves modal, chat, and cycle submissions', async () => {
		const [chat, composer, modal, page] = await Promise.all([
			read('pages', 'director', 'DirectorChatSection.tsx'),
			read('components', 'shared', 'DirectorComposer.tsx'),
			read('components', 'shared', 'DirectorChatModal.tsx'),
			read('pages', 'director', 'DirectorPage.tsx'),
		]);

		expect(composer).toContain('MAX_COMPOSER_HEIGHT_PX');
		expect(composer).toContain('composer.scrollHeight');
		expect(composer).toContain('composer.offsetHeight - composer.clientHeight');
		expect(composer).toContain(
			"DIRECTOR_COMPOSER_PLACEHOLDER = 'Tell the Director what to focus on…'",
		);
		expect(composer).toContain('event.nativeEvent.isComposing');
		expect(composer).toContain('event.shiftKey');
		expect(composer).toContain('event.preventDefault()');
		expect(composer).toContain('const submitEnabled = canSubmit && !disabled');
		expect(composer).toContain('<Send className="h-4 w-4" />');
		expect(composer).toContain("keys={['Enter']} />");
		expect(composer).toContain("keys={['Shift', 'Enter']} />");
		expect(composer).toContain("'max-h-28 min-h-11 flex-1 resize-none sm:min-h-9 sm:py-1'");
		expect(composer).not.toContain('<kbd');
		expect(chat).toContain('<DirectorComposer');
		expect(chat).toContain('placement="chat"');
		expect(page).toContain('<DirectorComposer');
		expect(page).toContain('placement="inline"');
		expect(modal).toContain('<DirectorComposer');
		expect(modal).toContain('composerRef={composerRef}');
		expect(modal).toContain('className="px-4 py-3"');
		expect(chat).not.toContain('<textarea');
		expect(modal).not.toContain('<Input');
		expect(page).not.toContain('<textarea');
	});
});
