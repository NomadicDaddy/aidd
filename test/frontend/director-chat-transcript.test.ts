import { describe, expect, test } from 'bun:test';
import { join, resolve } from 'node:path';

const SRC = resolve(import.meta.dir, '../../frontend/src');

function read(...segments: string[]): Promise<string> {
	return Bun.file(join(SRC, ...segments)).text();
}

function renderBubble(
	content: string,
	role: 'assistant' | 'system' | 'user',
	pending = false,
): string {
	const script = [
		"import { createElement } from 'react';",
		"import { renderToStaticMarkup } from 'react-dom/server';",
		"import { MemoryRouter } from 'react-router';",
		"import { ChatMessageBubble } from './src/components/shared/ChatMessageBubble.tsx';",
		`const bubble = createElement(ChatMessageBubble, ${JSON.stringify({ content, pending, role })});`,
		'console.log(renderToStaticMarkup(createElement(MemoryRouter, null, bubble)));',
	].join('\n');
	const result = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: resolve(import.meta.dir, '../../frontend'),
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
	return new TextDecoder().decode(result.stdout).trim();
}

type Rgb = readonly [red: number, green: number, blue: number];

function rgb(hex: string): Rgb {
	return [
		Number.parseInt(hex.slice(1, 3), 16),
		Number.parseInt(hex.slice(3, 5), 16),
		Number.parseInt(hex.slice(5, 7), 16),
	];
}

function composite(foreground: Rgb, background: Rgb, alpha: number): Rgb {
	return [
		foreground[0] * alpha + background[0] * (1 - alpha),
		foreground[1] * alpha + background[1] * (1 - alpha),
		foreground[2] * alpha + background[2] * (1 - alpha),
	];
}

function linearChannel(channel: number): number {
	const normalized = channel / 255;
	return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(colour: Rgb): number {
	return (
		linearChannel(colour[0]) * 0.2126 +
		linearChannel(colour[1]) * 0.7152 +
		linearChannel(colour[2]) * 0.0722
	);
}

function contrastRatio(first: Rgb, second: Rgb): number {
	const luminances = [relativeLuminance(first), relativeLuminance(second)];
	return (Math.max(...luminances) + 0.05) / (Math.min(...luminances) + 0.05);
}

function themeToken(css: string, theme: 'dark' | 'light', token: string): Rgb {
	const selector = theme === 'dark' ? '.dark {' : ':root {';
	const blockStart = css.indexOf(selector);
	const blockEnd = css.indexOf('\n}', blockStart);
	const block = css.slice(blockStart, blockEnd);
	const value = new RegExp(`--${token}:\\s*(#[0-9a-f]{6})`, 'iu').exec(block)?.[1];
	if (!value) throw new Error(`Missing --${token} in ${selector}`);
	return rgb(value);
}

function labelClasses(html: string, label: string): string {
	const classes = new RegExp(`<div class="([^"]+)">${label}</div>`, 'u').exec(html)?.[1];
	if (!classes) throw new Error(`Missing rendered ${label} label`);
	return classes;
}

describe('Director chat transcript rendering', () => {
	test('assistant and system replies render through the markdown boundary', () => {
		const markdown = [
			'**Fleet status**',
			'',
			'- Healthy',
			'',
			'| Project | State |',
			'| --- | --- |',
			'| aidd | `ready` |',
		].join('\n');

		for (const role of ['assistant', 'system'] as const) {
			const html = renderBubble(markdown, role);

			expect(html).toContain('<strong>Fleet status</strong>');
			expect(html).toContain('<ul');
			expect(html).toContain('<table');
			expect(html).toContain('<code');
			expect(html).not.toContain('**Fleet status**');
			expect(html).not.toContain('- Healthy');
			expect(html).not.toContain('`ready`');
			expect(html).not.toContain('| --- | --- |');
		}
	});

	test('a user message remains literal text', () => {
		const content = '**Keep this** and `this` literal.';
		const html = renderBubble(content, 'user');

		expect(html).toContain(content);
		expect(html).not.toContain('<strong>');
		expect(html).not.toContain('<code');
	});

	test('role labels use local colour tones that remain legible in both themes', async () => {
		const css = await read('index.css');
		const assistantClasses = labelClasses(renderBubble('Reply', 'assistant'), 'Director');
		const systemClasses = labelClasses(renderBubble('Notice', 'system'), 'System');
		const userHtml = renderBubble('Question', 'user');
		const userClasses = labelClasses(userHtml, 'You');

		expect(assistantClasses).toContain('text-foreground/70');
		expect(systemClasses).toContain('text-muted-foreground');
		expect(userClasses).toContain('text-foreground/70');
		expect(userHtml).toContain('bg-muted text-foreground');
		expect(userHtml).not.toContain('bg-foreground text-background');
		for (const classes of [assistantClasses, systemClasses, userClasses]) {
			expect(classes).not.toContain('opacity-');
		}

		for (const theme of ['dark', 'light'] as const) {
			const card = themeToken(css, theme, 'card');
			const foreground = themeToken(css, theme, 'foreground');
			const muted = themeToken(css, theme, 'muted');
			const mutedForeground = themeToken(css, theme, 'muted-foreground');

			expect(contrastRatio(composite(foreground, muted, 0.7), muted)).toBeGreaterThanOrEqual(
				4.5,
			);
			expect(contrastRatio(mutedForeground, card)).toBeGreaterThanOrEqual(4.5);
		}
	});

	test('a pending user turn uses muted colours without weakening the bubble subtree', () => {
		const html = renderBubble('Question', 'user', true);
		const classes = labelClasses(html, 'You');

		expect(html).toContain('bg-muted text-muted-foreground');
		expect(classes).toContain('text-muted-foreground');
		expect(html).not.toContain('opacity-');
	});

	test('generated replies can use the transcript width while user prose stays bounded', async () => {
		const source = await read('components/shared/ChatMessageBubble.tsx');
		const roles = source.slice(
			source.indexOf('const ROLE_CLASS'),
			source.indexOf('export function ChatMessageBubble'),
		);

		expect(roles).toContain("assistant: 'w-fit max-w-full");
		expect(roles).toContain("system: 'w-fit max-w-full");
		expect(roles).toContain('user: `ml-auto w-fit ${proseMeasureClass}');
	});

	test('the page and modal share pinning and optimistic request feedback', async () => {
		const [hook, modal, page, section] = await Promise.all([
			read('hooks/usePinnedChatTranscript.ts'),
			read('components/shared/DirectorChatModal.tsx'),
			read('pages/director/DirectorPage.tsx'),
			read('pages/director/DirectorChatSection.tsx'),
		]);

		expect(modal).toContain('usePinnedChatTranscript({');
		expect(section).toContain('usePinnedChatTranscript({');
		expect(hook).toContain('[active, conversationId, messageCount, pendingContent]');
		expect(hook).toContain('new ResizeObserver(pin)');
		expect(hook).toContain('window.requestAnimationFrame(pin)');
		expect(modal).toContain('<PendingChatMessage content={pendingContent} />');
		expect(section).toContain('<PendingChatMessage content={pendingContent} />');
		expect(page).toContain('setPendingChatMessage({ content, sessionId })');
		expect(page).toContain('onSettled()');
	});

	test('renders Director action errors with the error tone', async () => {
		const section = await read('pages/director/DirectorChatSection.tsx');

		expect(section).toContain("isError ? toneText.red : 'text-foreground'");
		expect(section).not.toContain('isError ? toneText.amber');
	});

	test('the compact modal preserves conversation hierarchy and consistent dialog geometry', async () => {
		const modal = await read('components/shared/DirectorChatModal.tsx');

		expect(modal).toContain('className="text-base font-semibold text-foreground"');
		expect(modal).toContain(
			'DialogPanel className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden"',
		);
		expect(modal).toContain('<Bot className="mt-0.5 h-4 w-4 text-accent" />');
		expect(modal).toContain("message.role === 'system' ? 'line-clamp-1' : undefined");
		expect(modal).toContain('scrollerClassName="h-full space-y-3 px-4 py-3"');
		expect(modal).toContain('className="px-4 py-3"');
	});
});
