import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const FRONTEND_SRC = resolve(import.meta.dir, '../../frontend/src');

async function source(path: string): Promise<string> {
	return await readFile(resolve(FRONTEND_SRC, path), 'utf8');
}

describe('coarse-pointer affordances', () => {
	test('restores a held-touch response without moving the target', async () => {
		const [button, styles] = await Promise.all([
			source('components/ui/button.tsx'),
			source('index.css'),
		]);

		expect(styles).toContain('@media (hover: none) and (pointer: coarse)');
		expect(styles).toContain('-webkit-tap-highlight-color: var(--accent)');
		expect(styles).toContain("[role='group'][tabindex]");
		expect(styles).toContain('&:active');
		expect(styles).toContain('filter: brightness(0.82)');
		expect(button).toContain('press-feedback inline-flex');
		expect(styles).toContain(":not(:disabled):not([aria-disabled='true'])");
	});

	test('marks interactive identity chips and destructive row actions at rest', async () => {
		const [identity, tones] = await Promise.all([
			source('components/shared/ExecutionIdentityBadges.tsx'),
			source('lib/tones.ts'),
		]);

		expect(identity).toContain('coarse-interactive-ring');
		expect(await source('index.css')).toContain('.coarse-interactive-ring');
		expect(tones).toContain('danger-row-action');
		expect(tones).toContain('[--danger-row-active:var(--color-red-100)]');
		expect(tones).toContain('text-red-600');
		expect(await source('index.css')).toContain('.danger-row-action:active');
	});

	test('makes a tappable Markdown heading anchor visible to a coarse pointer', async () => {
		const markdown = await source('components/shared/MarkdownContent.tsx');

		expect(markdown).toContain('coarse-heading-anchor');
		expect(markdown).toContain('href={`#${id}`}');
	});
});
