import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { parseMarkdownBlocks } from '../../frontend/src/lib/markdownBlocks.ts';

function frontend(relative: string): string {
	return readFileSync(resolve(import.meta.dir, '../../frontend', relative), 'utf8');
}

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
		const docsPage = frontend('src/pages/docs/DocsPage.tsx');
		const diaryCard = frontend('src/pages/diary/DiaryEntryCard.tsx');

		expect(docsPage).toContain(
			'<MarkdownContent baseLevel={2} markdown={body} skipLeadingTitle />',
		);
		expect(diaryCard).toContain('baseLevel={4}');
		expect(diaryCard).toContain('markdown={entry.bodyMd}');
	});

	test('uses the shared type scale, semantic tokens, and compact inline code', () => {
		const html = renderMarkdownContent(
			'## A readable question?\n\nUse `aidd`, then continue.',
			2,
		);

		expect(html).toContain('leading-relaxed');
		expect(html).toContain('text-base font-semibold text-foreground');
		expect(html).not.toContain('uppercase');
		expect(html).not.toContain('tracking-wide');
		expect(html).toContain('bg-muted px-0.5 font-mono text-[0.9em] text-foreground');
		expect(html).not.toContain('px-1');
		expect(html).not.toContain('py-0.5');
	});
});

describe('a list renders as a list', () => {
	const glossary = [
		'- **Feature**: the unit of work a coding run claims.',
		'- **Run**: one backend invocation against a claimed feature.',
		'- **Recipe**: an ordered set of steps a director executes.',
	].join('\n');

	test('a glossary keeps its bullets and its bold terms', () => {
		const html = renderWithProps({ baseLevel: 2, markdown: glossary });

		expect(html).toContain('<ul');
		expect(html).toContain('<strong>Feature</strong>');
		expect(html).toContain('the unit of work a coding run claims.');
	});

	test('one added bullet does not relay the items around it', () => {
		// The previous treatment swapped the whole block to a two-column `<dl>` only when every
		// item matched `**term**: definition`, so adding one plain bullet to a glossary silently
		// changed the layout of every other item in a section the author had not touched.
		const three = renderWithProps({ baseLevel: 2, markdown: glossary });
		const four = renderWithProps({
			baseLevel: 2,
			markdown: `${glossary}\n- a plain trailing bullet`,
		});

		expect(four).toContain(three.slice(three.indexOf('<li>'), three.lastIndexOf('</li>')));
	});

	test('no surface can render the same markdown as a different shape', () => {
		// Identical output across every embedding surface is the point; `baseLevel` shifts the
		// heading level and nothing else about the document's structure.
		const bodies = [2, 3, 4].map((level) =>
			renderWithProps({ baseLevel: level, markdown: glossary }),
		);

		expect(new Set(bodies).size).toBe(1);
		expect(bodies[0]).not.toContain('<dl');
	});
});

describe('the measure belongs to the container', () => {
	test('the renderer sets no width of its own', () => {
		const html = renderMarkdownContent('A paragraph of prose.', 2);

		// Capped inside, a doc card drew its border at the column's full width and left a second
		// gutter of empty space to the right of every line.
		expect(html).not.toContain('max-w-');
	});

	test('every surface that embeds prose carries the cap', () => {
		const measure = frontend('src/lib/typography.ts');
		expect(measure).toContain("export const proseMeasureClass = 'max-w-[68ch]'");

		for (const file of [
			'src/pages/docs/DocsPage.tsx',
			'src/pages/docs/HelpDrawerBody.tsx',
			'src/pages/diary/DiaryEntryCard.tsx',
			'src/pages/skills/SkillsPage.tsx',
		]) {
			expect(frontend(file)).toContain('proseMeasureClass');
		}
	});

	test('the doc card is what the cap sits on, so its border reaches the prose', () => {
		expect(frontend('src/pages/docs/DocsPage.tsx')).toContain(
			"<Card className={cn('min-w-0 p-5 sm:p-7', proseMeasureClass)}>",
		);
	});
});

describe('fenced code and links', () => {
	test('a fence is code, not reflowed prose', () => {
		const blocks = parseMarkdownBlocks(
			'Run it:\n\n```bash\naidd run --watch\n  --verbose\n```',
		);

		// A skill definition is mostly fenced examples. Without this the fence lines became
		// paragraphs reading "```bash" and the command was joined into one wrapped run of prose.
		expect(blocks).toContainEqual({ code: 'aidd run --watch\n  --verbose', type: 'code' });
		expect(renderMarkdownContent('```\nls -la\n```', 2)).toContain('<pre');
	});

	test('a rule inside a fence is content', () => {
		const blocks = parseMarkdownBlocks('```\n---\n```');

		expect(blocks).toEqual([{ code: '---', type: 'code' }]);
	});

	test('an unterminated fence consumes the rest of the document', () => {
		const blocks = parseMarkdownBlocks('```\nstill open');

		expect(blocks).toEqual([{ code: 'still open', type: 'code' }]);
	});

	test('a link is a link in the accessibility tree', () => {
		const html = renderMarkdownContent('See [the docs](https://example.com/x) for more.', 2);

		expect(html).toContain('href="https://example.com/x"');
		expect(html).toContain('>the docs</a>');
		expect(html).toContain('rel="noreferrer"');
	});

	test('an in-app link opens in place', () => {
		const html = renderMarkdownContent('Go to [Runs](/runs).', 2);

		expect(html).toContain('href="/runs"');
		expect(html).not.toContain('target="_blank"');
	});

	test('a scheme that is not a destination renders as text', () => {
		// Skill definitions are imported files; a markdown href is untrusted input, and this is
		// the one sink a renderer with no dangerouslySetInnerHTML could still hand an attacker.
		const html = renderMarkdownContent('[click](javascript:alert(1))', 2);

		expect(html).not.toContain('<a');
		expect(html).toContain('click');
	});
});

describe('no surface shows markdown source', () => {
	test('Skills renders its definition through the shared renderer', () => {
		const page = frontend('src/pages/skills/SkillsPage.tsx');

		// It was monospaced, reflowed mid-word, with its `##` and `-` markers left as literal
		// characters — the operator read the file rather than the document, and the headings of a
		// skill definition were nowhere in the accessibility tree.
		expect(page).toContain('markdown={selected.body}');
		expect(page).toContain('skipLeadingTitle');
		expect(page).not.toMatch(/<pre[^>]*>\s*\{selected\.body\}/);
		expect(page).not.toContain('whitespace-pre-wrap');
	});

	test('headings and lists survive into the rendered document', () => {
		const html = renderMarkdownContent(
			'## Usage\n\n- first step\n- second step\n\n```\naidd go\n```',
			2,
		);

		expect(html).toMatch(/<h3[^>]*>Usage<\/h3>/);
		expect(html).toContain('<li>first step</li>');
		expect(html).toContain('<code>aidd go</code>');
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
