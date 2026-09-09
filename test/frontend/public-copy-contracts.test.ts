import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

const frontendRoot = resolve(import.meta.dir, '../../frontend');

function render(imports: string, expression: string): string {
	const script = [
		"import { createElement as h } from 'react';",
		"import { renderToStaticMarkup } from 'react-dom/server';",
		"import { MemoryRouter } from 'react-router';",
		"import { QueryClient, QueryClientProvider } from '@tanstack/react-query';",
		"import { createBlankSettings } from './src/pages/settings/settingsUtils.ts';",
		imports,
		'const client = new QueryClient({ defaultOptions: { queries: { enabled: false, retry: false } } });',
		`const content = ${expression};`,
		'console.log(renderToStaticMarkup(h(QueryClientProvider, { client }, h(MemoryRouter, null, content))));',
	].join('\n');
	const result = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: frontendRoot,
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
	return new TextDecoder().decode(result.stdout).replace(/\s+/g, ' ').trim();
}

describe('public copy discloses operational consequences', () => {
	test('re-intake shows the approval consequence before launch', () => {
		const html = render(
			"import { ReintakeCard } from './src/pages/projects/detail/ReintakeCard.tsx';",
			"h(ReintakeCard, { project: { path: '/projects/example' } })",
		);
		expect(html).toContain('Existing backlog and in-progress features return to approval');
		expect(html).toContain('before coding can resume');
		expect(html).toContain('<code class="font-mono">.aidd</code>');
	});

	test('shared-copy settings name the destination and overwrite behavior', () => {
		const html = render(
			"import { SharedMetadataSection } from './src/pages/settings/SharedMetadataSection.tsx';",
			'h(SharedMetadataSection, { form: createBlankSettings(), setField: () => {} })',
		);
		expect(html).toContain('project root during fresh-project scaffolding');
		expect(html).toContain('Matching files can be overwritten');
		expect(html).toContain('project-relative target');
		expect(html).toContain('write allowlists limit the permitted targets');
	});

	test('Director permissions disclose direct shell access and Telegram scope', () => {
		const html = render(
			"import { DirectAiSection } from './src/pages/settings/DirectAiSection.tsx';",
			`h(DirectAiSection, {
				defaultProvider: null,
				directAi: createBlankSettings().directAi,
				directorChatAllowFileEdits: false,
				providerNames: [], providers: {}, setField: () => {},
			})`,
		);
		expect(html).toContain('Off by default');
		expect(html).toContain('edit files and run shell commands directly');
		expect(html).toContain('outside that supervision');
		expect(html).toContain('It applies to Telegram chat too');
	});

	test('network settings explain the automatic restart on save', () => {
		const html = render(
			"import { NetworkAccessSection } from './src/pages/settings/NetworkAccessSection.tsx';",
			'h(NetworkAccessSection, { form: { ...createBlankSettings(), allowRemote: true }, setField: () => {} })',
		);
		expect(html).toContain('Saving a change to this setting restarts the panel');
		expect(html).not.toContain('The next restart can expose');
	});

	test('Telegram copy describes chat and the hidden saved credential', () => {
		const html = render(
			"import { TelegramChannelSection } from './src/pages/settings/TelegramChannelSection.tsx';",
			'h(TelegramChannelSection, { form: createBlankSettings(), setField: () => {} })',
		);
		expect(html).toContain('Chat with the Director through Telegram');
		expect(html).toContain('The saved bot token is not displayed here');
	});

	test('settings help renders file destinations and environment-token guidance', () => {
		const html = render(
			"import { MarkdownContent } from './src/components/shared/MarkdownContent.tsx';",
			"h(MarkdownContent, { markdown: await Bun.file('./content/docs/settings.md').text(), measure: 'prose' })",
		);
		expect(html).toContain('project-relative target');
		expect(html).toContain('AIDD_TELEGRAM_BOT_TOKEN');
		expect(html).toContain('an environment token takes precedence');
	});
});
