import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { parseMarkdownBlocks } from '../../frontend/src/lib/markdownBlocks.ts';

function renderMarkdownContent(markdown: string, baseLevel?: 2 | 3 | 4): string {
	return renderWithProps(baseLevel === undefined ? { markdown } : { baseLevel, markdown });
}

function renderWithProps(props: Record<string, unknown>): string {
	const script = [
		"import { createElement } from 'react';",
		"import { renderToStaticMarkup } from 'react-dom/server';",
		"import { MarkdownContent } from './src/components/shared/MarkdownContent.tsx';",
		`console.log(renderToStaticMarkup(createElement(MarkdownContent, ${JSON.stringify(props)})));`,
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

describe('parseMarkdownBlocks', () => {
	test('parses headings at levels 1-3', () => {
		const blocks = parseMarkdownBlocks('# One\n\n## Two\n\n### Three');
		expect(blocks).toEqual([
			{ level: 1, text: 'One', type: 'heading' },
			{ level: 2, text: 'Two', type: 'heading' },
			{ level: 3, text: 'Three', type: 'heading' },
		]);
	});

	test('groups consecutive list items into one block', () => {
		const blocks = parseMarkdownBlocks('- a\n- b\n- c');
		expect(blocks).toEqual([{ items: ['a', 'b', 'c'], ordered: false, type: 'list' }]);
	});

	test('detects ordered lists', () => {
		const blocks = parseMarkdownBlocks('1. first\n2. second');
		expect(blocks).toEqual([{ items: ['first', 'second'], ordered: true, type: 'list' }]);
	});

	test('folds hanging-indented continuation lines into the current item', () => {
		const blocks = parseMarkdownBlocks('1. first line\n   wrapped tail\n2. second');
		expect(blocks).toEqual([
			{ items: ['first line wrapped tail', 'second'], ordered: true, type: 'list' },
		]);
	});

	test('collects blockquote lines', () => {
		const blocks = parseMarkdownBlocks('> quoted line\n> second line');
		expect(blocks).toEqual([{ lines: ['quoted line', 'second line'], type: 'quote' }]);
	});

	test('joins wrapped paragraph lines and splits on blank lines', () => {
		const blocks = parseMarkdownBlocks('one\ntwo\n\nthree');
		expect(blocks).toEqual([
			{ text: 'one two', type: 'paragraph' },
			{ text: 'three', type: 'paragraph' },
		]);
	});

	test('recognizes a horizontal rule', () => {
		const blocks = parseMarkdownBlocks('above\n\n---\n\nbelow');
		expect(blocks).toContainEqual({ type: 'hr' });
	});

	test('strips a leading frontmatter fence', () => {
		const blocks = parseMarkdownBlocks("---\ntitle: 'X'\n---\n\n# Body");
		expect(blocks).toEqual([{ level: 1, text: 'Body', type: 'heading' }]);
	});

	test('renders contiguous heading levels for each embedding surface', () => {
		const markdown = '# Title\n\n## Section\n\n### Detail';
		const docs = renderMarkdownContent(markdown, 2);
		const helpDrawer = renderMarkdownContent(markdown);
		const diary = renderMarkdownContent(markdown, 4);

		expect(docs).toMatch(/<h2[^>]*>Title<\/h2>.*<h3[^>]*>Section<\/h3>.*<h4[^>]*>Detail<\/h4>/);
		expect(helpDrawer).toMatch(
			/<h3[^>]*>Title<\/h3>.*<h4[^>]*>Section<\/h4>.*<h5[^>]*>Detail<\/h5>/,
		);
		expect(diary).toMatch(
			/<h4[^>]*>Title<\/h4>.*<h5[^>]*>Section<\/h5>.*<h6[^>]*>Detail<\/h6>/,
		);
	});

	test('embeds the shared renderer beneath each consumer heading', () => {
		const docsPage = readFileSync(
			resolve(import.meta.dir, '../../frontend/src/pages/docs/DocsPage.tsx'),
			'utf8',
		);
		const diaryCard = readFileSync(
			resolve(import.meta.dir, '../../frontend/src/pages/diary/DiaryEntryCard.tsx'),
			'utf8',
		);

		expect(docsPage).toContain(
			'<MarkdownContent baseLevel={2} markdown={body} skipLeadingTitle />',
		);
		expect(diaryCard).toContain('<MarkdownContent baseLevel={4} markdown={entry.bodyMd} />');
	});

	test('uses the shared type scale, reading measure, semantic tokens, and compact inline code', () => {
		const html = renderMarkdownContent(
			'## A readable question?\n\nUse `aidd`, then continue.',
			2,
		);

		expect(html).toContain('max-w-[68ch]');
		expect(html).toContain('leading-relaxed');
		expect(html).toContain('text-base font-semibold text-foreground');
		expect(html).not.toContain('uppercase');
		expect(html).not.toContain('tracking-wide');
		expect(html).toContain('bg-muted px-0.5 font-mono text-[0.9em] text-foreground');
		expect(html).not.toContain('px-1');
		expect(html).not.toContain('py-0.5');
	});
});

describe('definition lists', () => {
	const glossary = [
		'- **Feature**: the unit of work a coding run claims.',
		'- **Run**: one backend invocation against a claimed feature.',
		'- **Recipe**: an ordered set of steps a director executes.',
	].join('\n');

	test('renders a bulleted glossary as term and definition columns', () => {
		const html = renderWithProps({ baseLevel: 2, markdown: glossary });

		// 25 `**Term**: definition` bullets read as one undifferentiated wall; the pairs are a
		// definition list, so the renderer emits one.
		expect(html).toContain('<dl');
		expect(html).toContain('sm:grid-cols-[11rem_minmax(0,1fr)]');
		expect(html).toContain('<dt class="text-sm font-medium text-foreground">Feature</dt>');
		expect(html).toContain('the unit of work a coding run claims.');
		expect(html).not.toContain('<ul');
	});

	test('leaves ordinary bulleted lists alone', () => {
		const html = renderWithProps({ baseLevel: 2, markdown: '- one\n- two\n- three' });

		expect(html).toContain('<ul');
		expect(html).not.toContain('<dl');
	});

	test('requires every item to be a definition before switching layout', () => {
		const mixed = `${glossary}\n- a plain trailing bullet`;
		const html = renderWithProps({ baseLevel: 2, markdown: mixed });

		expect(html).toContain('<ul');
		expect(html).not.toContain('<dl');
	});

	test('does not treat a lone pair as a glossary', () => {
		const html = renderWithProps({ baseLevel: 2, markdown: '- **Run**: one invocation.' });

		expect(html).toContain('<ul');
		expect(html).not.toContain('<dl');
	});
});

describe('skipLeadingTitle', () => {
	const doc = '# Operating aidd\n\nThe body follows.';

	test('drops the leading h1 so the page header is the only title', () => {
		const html = renderWithProps({ baseLevel: 2, markdown: doc, skipLeadingTitle: true });

		expect(html).not.toContain('Operating aidd');
		expect(html).toContain('The body follows.');
	});

	test('keeps the title when the consumer renders no header of its own', () => {
		expect(renderWithProps({ baseLevel: 2, markdown: doc })).toContain('Operating aidd');
	});

	test('only drops a leading level-one heading', () => {
		const html = renderWithProps({
			baseLevel: 2,
			markdown: '## Already a section\n\nBody.',
			skipLeadingTitle: true,
		});

		expect(html).toContain('Already a section');
	});
});
