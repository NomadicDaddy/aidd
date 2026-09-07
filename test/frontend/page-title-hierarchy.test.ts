import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

function renderPageTitleAndDocument(): string {
	const script = [
		"import { createElement, Fragment } from 'react';",
		"import { renderToStaticMarkup } from 'react-dom/server';",
		"import { MemoryRouter } from 'react-router';",
		"import { MarkdownContent } from './src/components/shared/MarkdownContent.tsx';",
		"import { PageHeader } from './src/components/shared/PageHeader.tsx';",
		"import { PageRail } from './src/components/shared/PageRail.tsx';",
		'const markdown = createElement(MarkdownContent, {',
		'\tbaseLevel: 2,',
		"\tmarkdown: '## Section\\n\\n### Detail',",
		'});',
		'const content = createElement(',
		'\tFragment,',
		'\tnull,',
		"\tcreateElement(PageHeader, { title: 'Docs' }),",
		"\tcreateElement('article', null, markdown),",
		');',
		"const page = createElement(PageRail, { rail: 'bounded' }, content);",
		'console.log(renderToStaticMarkup(createElement(MemoryRouter, null, page)));',
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

describe('page title hierarchy', () => {
	test('separates PageHeader from the document heading ladder by size and weight', () => {
		const html = renderPageTitleAndDocument();

		expect(html).toContain(
			'<h1 class="font-display text-2xl font-bold tracking-tight text-foreground">Docs</h1>',
		);
		expect(html).toContain(
			'class="group mt-6 mb-2 text-xl font-semibold tracking-tight text-foreground"',
		);
		expect(html).toContain(
			'class="group mt-5 mb-1.5 text-lg font-semibold tracking-tight text-foreground"',
		);
	});
});
