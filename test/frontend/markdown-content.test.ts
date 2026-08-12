import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
	markdownHeadings,
	parseMarkdownBlocks,
	plainInlineText,
} from '../../frontend/src/lib/markdownBlocks.ts';

function frontend(relative: string): string {
	return readFileSync(resolve(import.meta.dir, '../../frontend', relative), 'utf8');
}

function renderMarkdownContent(markdown: string, baseLevel?: 2 | 3 | 4): string {
	return renderWithProps(baseLevel === undefined ? { markdown } : { baseLevel, markdown });
}

function renderWithProps(props: Record<string, unknown>): string {
	// Wrapped in a router because the renderer emits one: an in-app `[text](/runs)` is a react-router
	// `<Link>`, which reads `NavigationContext` and throws outright when there is none. The wrapper
	// contributes no markup of its own, and every surface that mounts `MarkdownContent` is inside the
	// app's router already — so this makes the harness match where the component actually runs rather
	// than granting it something it does not have in production.
	const script = [
		"import { createElement } from 'react';",
		"import { renderToStaticMarkup } from 'react-dom/server';",
		"import { MemoryRouter } from 'react-router';",
		"import { MarkdownContent } from './src/components/shared/MarkdownContent.tsx';",
		`const content = createElement(MarkdownContent, ${JSON.stringify(props)});`,
		'console.log(renderToStaticMarkup(createElement(MemoryRouter, null, content)));',
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

	test('parses explicitly authored term and definition rows', () => {
		const blocks = parseMarkdownBlocks(
			'Feature\n: a unit of tracked work with a status.\nThe status is explicit.\nRun\n: one orchestrator invocation.',
		);

		expect(blocks).toEqual([
			{
				entries: [
					{
						definition: 'a unit of tracked work with a status. The status is explicit.',
						term: 'Feature',
					},
					{ definition: 'one orchestrator invocation.', term: 'Run' },
				],
				type: 'definitions',
			},
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

	test('drops HTML comments, which are markup rather than content', () => {
		// The docs carry `check-docs-allow:` waiver markers as HTML comments, because the gate that
		// resolves internal links against the filesystem cannot tell an app route from a file path.
		// Those are instructions to a build gate; without this they printed on the page verbatim.
		const blocks = parseMarkdownBlocks(
			'Open [Settings](/settings). <!-- check-docs-allow: app route -->\n' +
				'<!-- a whole line of it -->\n' +
				'The paragraph continues.',
		);

		// One paragraph, not three: a comment on its own line is removed rather than blanked, since
		// a blank line here would split the paragraph the comment was sitting inside.
		expect(blocks).toEqual([
			{ text: 'Open [Settings](/settings). The paragraph continues.', type: 'paragraph' },
		]);
	});

	test('drops a comment that spans lines', () => {
		const blocks = parseMarkdownBlocks('before\n\n<!-- one\ntwo\nthree -->\n\nafter');

		expect(blocks).toEqual([
			{ text: 'before', type: 'paragraph' },
			{ text: 'after', type: 'paragraph' },
		]);
	});

	test('a comment inside a fence is the example, not a comment', () => {
		// A skill definition that documents HTML would otherwise have its own sample deleted out of
		// the code block that exists to show it.
		const blocks = parseMarkdownBlocks('```html\n<!-- keep me -->\n```');

		expect(blocks).toEqual([{ code: '<!-- keep me -->', type: 'code' }]);
	});

	test('renders contiguous heading levels for each embedding surface', () => {
		const markdown = '# Title\n\n## Section\n\n### Detail';
		const docs = renderMarkdownContent(markdown, 2);
		const helpDrawer = renderMarkdownContent(markdown);
		const diary = renderMarkdownContent(markdown, 4);

		// Each heading now carries its anchor link after the text, so the close tag no longer
		// follows the words directly.
		expect(docs).toMatch(
			/<h2[^>]*>Title .*?<\/h2>.*<h3[^>]*>Section .*?<\/h3>.*<h4[^>]*>Detail .*?<\/h4>/,
		);
		expect(helpDrawer).toMatch(
			/<h3[^>]*>Title .*?<\/h3>.*<h4[^>]*>Section .*?<\/h4>.*<h5[^>]*>Detail .*?<\/h5>/,
		);
		expect(diary).toMatch(
			/<h4[^>]*>Title .*?<\/h4>.*<h5[^>]*>Section .*?<\/h5>.*<h6[^>]*>Detail .*?<\/h6>/,
		);
	});

	test('measures depth from the document, not from the hash count', () => {
		// `baseLevel + level - 1` read `##` as depth 2 no matter what came before it. Docs passes
		// `skipLeadingTitle`, so its `#` is already the page `h1` and every remaining heading is at
		// least `##` — which put the first in-article heading at `h3` and meant the entire
		// documentation set never emitted an `h2`. A screen reader's outline navigation walks these
		// levels; a skipped one is a hole in the document, not a cosmetic complaint.
		const html = renderMarkdownContent('## Section\n\n### Detail', 2);

		expect(html).toMatch(/<h2[^>]*>Section /);
		expect(html).toMatch(/<h3[^>]*>Detail /);
		expect(html).not.toContain('<h4');
	});

	test('an embedded document opens below the card header, not above it', () => {
		const markdown = '## Workflow\n\n### Output';
		const docs = renderMarkdownContent(markdown, 2);
		const skills = renderMarkdownContent(markdown, 4);

		// Measured on /skills at 2250x1309 before this: h1 24px, h2 16px, h3 16px, h4 20px. The
		// Definition card's own header renders at 16px and the `##` headings of the SKILL.md inside
		// it rendered at 20px, because the scale was indexed by depth alone and every document
		// entered it at the top step no matter how deeply the surface embedded it. Distinguishable
		// from the card header, which is what the scale was built for — and louder than it, which
		// inverts the nesting the reader is trying to read.
		expect(docs).toContain('text-xl font-semibold tracking-tight text-foreground');
		expect(skills).not.toContain('text-xl');
		expect(skills).not.toContain('text-lg');
		expect(skills).toContain(
			'text-sm font-semibold tracking-wide text-muted-foreground uppercase',
		);

		// Two heading levels still read as two. 39 of this repo's 76 skill definitions use `###`, so
		// clamping the embedded document to one mark would have traded an inverted outline for a
		// flattened one — the same collapse this feature was filed against.
		expect(skills).toContain('text-xs font-semibold tracking-wide text-muted-foreground');
		const [outer, inner] = ['Workflow', 'Output'].map((text) =>
			skills.slice(skills.lastIndexOf('<h', skills.indexOf(text)), skills.indexOf(text)),
		);
		expect(outer).not.toEqual(inner);
	});

	test('gives every heading a stable id and an anchor to it', () => {
		const html = renderMarkdownContent('## Getting started\n\n## Getting started', 2);

		// Derived from the text, so an edit elsewhere in the document does not move an existing
		// anchor; suffixed on collision, so the second of two identical headings is still reachable.
		expect(html).toContain('id="getting-started"');
		expect(html).toContain('href="#getting-started"');
		expect(html).toContain('id="getting-started-2"');
		expect(html).toContain('href="#getting-started-2"');
		// Revealed on hover for a pointer and on focus for a keyboard. Hover alone would make the
		// anchors reachable by exactly one of the two.
		expect(html).toContain('group-hover:opacity-100');
		expect(html).toContain('focus-visible:opacity-100');
	});

	test('a heading is named by its own text, not by the anchor inside it', () => {
		const html = renderMarkdownContent('## What `aidd` does', 2);

		// The anchor is a child of the heading, so its label was part of the heading's accessible
		// name: "What aidd does" announced as "What aidd does, Link to section What aidd does". The
		// heading labels itself, which lets the anchor stay where it has to be to sit beside the
		// words. Both labels are the plain text — an `aria-label` is a string, so the backticks of
		// `` `aidd` `` would otherwise be spoken.
		expect(html).toContain('aria-label="What aidd does"');
		expect(html).toContain('aria-label="Link to section What aidd does"');
		expect(html).not.toContain('`aidd`');
	});

	test('namespaces heading ids when a page renders several documents', () => {
		const html = renderWithProps({
			baseLevel: 4,
			idPrefix: 'entry-7',
			markdown: '## Summary',
		});

		expect(html).toContain('id="entry-7-summary"');
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

	test('uses the shared type scale, semantic tokens, and a legible inline-code chip', () => {
		const html = renderMarkdownContent(
			'## A readable question?\n\nUse `aidd`, then continue.',
			2,
		);

		expect(html).toContain('leading-relaxed');
		// Document headings must NOT reuse `ui/card`'s two header steps. They did — `text-base
		// font-semibold text-foreground` and `text-sm font-semibold text-foreground`, character for
		// character — so a markdown `##` inside a titled Card rendered identically to the card's own
		// header and the reader had no way to tell the document's structure from the container's.
		// The card contract is the correct one; this is the scale that had to move.
		const card = frontend('src/components/ui/card.tsx');
		for (const step of [
			'text-base font-semibold text-foreground',
			'text-sm font-semibold text-foreground',
		]) {
			expect(card).toContain(step);
			expect(html).not.toContain(step);
		}
		expect(html).toContain('text-xl font-semibold tracking-tight text-foreground');
		// The chip used to be `bg-muted px-0.5` with nothing vertical, and this test pinned that as
		// "compact". Compact was the defect: the fill is 1.14:1 against the doc card it sits on, so
		// two horizontal pixels of an invisible colour left the code with neither an edge nor a
		// shape. It has both now, and the border is what carries it on a sunken panel where the
		// fill and the ground are the same token.
		expect(html).toContain(
			'rounded-sm border border-border bg-muted px-1 py-px font-mono text-[0.9em] text-foreground',
		);
		// Still not the chip idiom used for a metadata pill elsewhere: this is a run of characters
		// inside a sentence, and `py-0.5` would push the line box of every paragraph holding one.
		expect(html).not.toContain('py-0.5');
	});
});

describe('lists and explicitly authored definitions keep their own structure', () => {
	const bulletedGlossary = [
		'- **Feature**: the unit of work a coding run claims.',
		'- **Run**: one backend invocation against a claimed feature.',
		'- **Recipe**: an ordered set of steps a director executes.',
	].join('\n');
	const definitions = [
		'Feature',
		': the unit of work a coding run claims.',
		'Run',
		': one orchestrator invocation against a claimed feature.',
	].join('\n');

	test('ordinary bold-first bullets stay bullets', () => {
		const html = renderWithProps({ baseLevel: 2, markdown: bulletedGlossary });

		expect(html).toContain('<ul');
		expect(html).toContain('<strong>Feature</strong>');
		expect(html).toContain('the unit of work a coding run claims.');
		expect(html).not.toContain('<dl');
	});

	test('one added bullet does not relay the items around it', () => {
		// The previous treatment swapped the whole block to a two-column `<dl>` only when every
		// item matched `**term**: definition`, so adding one plain bullet to a glossary silently
		// changed the layout of every other item in a section the author had not touched.
		const three = renderWithProps({ baseLevel: 2, markdown: bulletedGlossary });
		const four = renderWithProps({
			baseLevel: 2,
			markdown: `${bulletedGlossary}\n- a plain trailing bullet`,
		});

		expect(four).toContain(three.slice(three.indexOf('<li>'), three.lastIndexOf('</li>')));
	});

	test('explicit definitions render as semantic rows on every embedding surface', () => {
		// The `:` marker belongs to the authored structure. Unlike the retired bold-plus-colon
		// heuristic, it does not ask the surrounding items what shape this block should take.
		const bodies = [2, 3, 4].map((level) =>
			renderWithProps({ baseLevel: level, markdown: definitions }),
		);

		expect(new Set(bodies).size).toBe(1);
		expect(bodies[0]).toContain('<dl');
		expect(bodies[0]).toContain('<dt class="font-semibold text-foreground">Feature</dt>');
		expect(bodies[0]).toContain('<dd class="mt-1 text-muted-foreground">');
		expect(bodies[0]).not.toContain('<ul');
	});

	test('the Glossary renders every heading group and every term semantically', () => {
		const markdown = frontend('content/docs/glossary.md');
		const blocks = parseMarkdownBlocks(markdown);
		const groups = [
			'Runtime and orchestration',
			'Work tracking',
			'Project assessment',
			'Director',
			'Control panel',
		];
		const terms = [
			'CLI',
			'Provider',
			'Model',
			'Run',
			'Iteration',
			'Mode',
			'Triumvirate',
			'Feature',
			'Audit finding',
			'Remediation',
			'Milestone',
			'Dependency',
			'Phase',
			'Maturity stage',
			'Project profile',
			'Director',
			'Cycle',
			'Suggestion',
			'Fleet',
			'Project',
			'Recipe',
			'Pipeline session',
			'Skill',
			'Audit',
			'Direct AI',
		];
		const definitionBlocks = blocks.filter((block) => block.type === 'definitions');

		expect(
			blocks.flatMap((block) =>
				block.type === 'heading' && block.level === 2 ? [block.text] : [],
			),
		).toEqual(groups);
		expect(definitionBlocks).toHaveLength(5);
		expect(
			definitionBlocks.flatMap((block) => block.entries.map((entry) => entry.term)),
		).toEqual(terms);

		const html = renderWithProps({ baseLevel: 2, markdown, skipLeadingTitle: true });
		expect(html.match(/<dl/g)).toHaveLength(5);
		expect(html.match(/<dt/g)).toHaveLength(25);
		expect(html.match(/<dd/g)).toHaveLength(25);
		for (const group of groups) expect(html).toContain(`aria-label="${group}"`);
		for (const term of terms) {
			expect(html).toContain(`<dt class="font-semibold text-foreground">${term}</dt>`);
		}
		expect(html).toContain('<code');
		expect(html).toContain('claude-code</code>');
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
		// `46ch`, not `68ch`, for a 68-character measure. `ch` is the advance of `0`, which in Geist
		// Sans at 14px is 9.297px against 6.293px for the average character in these pages' prose —
		// a size-independent ratio of 1.477, so `68ch` was holding 100 characters. 68 / 1.477 = 46.
		expect(measure).toContain("export const proseMeasureClass = 'max-w-[46ch]'");

		for (const file of [
			'src/pages/docs/DocsPage.tsx',
			'src/pages/docs/HelpDrawerBody.tsx',
			'src/pages/diary/DiaryEntryCard.tsx',
			'src/pages/skills/SkillDefinitionCard.tsx',
		]) {
			// `proseMeasureCardClass` satisfies this too, and is meant to: the docs card wraps the
			// prose instead of being it, so it carries the corrected form of the same measure.
			expect(frontend(file)).toContain('proseMeasure');
		}
	});

	test('the doc card is what the cap sits on, so its border reaches the prose', () => {
		expect(frontend('src/pages/docs/DocsPage.tsx')).toContain(
			"<Card className={cn('min-w-0 p-5 sm:p-7', proseMeasureCardClass)}>",
		);
	});

	test('a container that wraps the prose corrects for its own face and padding', () => {
		const measure = frontend('src/lib/typography.ts');

		// Two corrections, and dropping either one leaves the measure wrong. `ch` is the advance of
		// `0` in the element's own face: on the 16px card that is not the `text-sm` the prose is set
		// in, and `14/16` is the whole of the difference. And `max-width` on a `border-box` element
		// includes padding, so the card's `p-7` was being taken out of the 68 characters instead of
		// sitting outside them.
		expect(measure).toContain(
			"export const proseMeasureCardClass = 'max-w-[calc(46ch*0.875_+_3.5rem)]'",
		);
	});

	test('the docs split measures the column it is splitting, not the viewport', () => {
		const page = frontend('src/pages/docs/DocsPage.tsx');

		// `lg:` reads the viewport, and the viewport does not know how wide the rail is. At 768 the
		// same tier covered a 656px column (rail collapsed) and a 480px one (rail expanded), where
		// the sidebar would have left roughly 230px of prose beside 224px of navigation.
		expect(page).toContain('className="@container"');
		expect(page).toContain('@min-[45rem]:grid-cols-[14rem_minmax(0,1fr)]');
		expect(page).toContain('@min-[45rem]:hidden');
		expect(page).toContain('hidden @min-[45rem]:block');

		// Nothing on this page decides anything by viewport tier any more — a leftover `lg:` beside
		// a container query is the two answers this change exists to collapse into one. Comments
		// stripped: the note above the grid names the tier it replaced.
		const code = page.replaceAll(/\/\*[\s\S]*?\*\//g, '').replaceAll(/\/\/[^\n]*/g, '');
		expect(code).not.toContain('lg:');
	});
});

describe('the outline is shared, and the width the measure releases is claimed', () => {
	test('the plain form of a heading drops the markers and keeps the words', () => {
		expect(plainInlineText('What `aidd` does')).toBe('What aidd does');
		expect(plainInlineText('**Never** overwrite a *run*')).toBe('Never overwrite a run');
		expect(plainInlineText('See [the runs page](/runs)')).toBe('See the runs page');
	});

	test('the outline reports the ids the renderer will emit', () => {
		const document = '# Title\n\n## Getting started\n\n### A detail\n\n## Getting started';
		const outline = markdownHeadings(document, { skipLeadingTitle: true });

		// Same allocator, same order, so a repeated heading suffixes identically on both sides. A
		// second slugifier here is a table of contents that links to the wrong section.
		expect(outline.map((heading) => heading.id)).toEqual([
			'getting-started',
			'a-detail',
			'getting-started-2',
		]);
		// Depth is measured from the document's own shallowest heading, matching the renderer, so a
		// `##`-only document is all depth 0 rather than all depth 1.
		expect(outline.map((heading) => heading.depth)).toEqual([0, 1, 0]);

		const html = renderMarkdownContent(document, 2);
		for (const heading of outline) expect(html).toContain(`id="${heading.id}"`);
	});

	test('a rail claims the width the reading measure gives up', () => {
		const page = frontend('src/pages/docs/DocsPage.tsx');

		// Capping the article without giving anything the width it released made the void worse, not
		// better: 1231px of a 1962px content column at 2250x1309, against 1027px before the cap. The
		// third column is the fix, at the width where 224 + 480 + 224 + two 24px gaps still leaves
		// the article its measure.
		expect(page).toContain('@min-[61rem]:grid-cols-[14rem_minmax(0,1fr)_14rem]');
		expect(page).toContain('<DocsOutline body={body} />');

		// Below that width the compact `<details>` already lists every section of every document, so
		// the rail is hidden rather than stacked under the article as a second copy of it.
		expect(page).toContain('hidden @min-[61rem]:sticky');
	});

	test('the rail is the document, not a second navigation', () => {
		// Not `DocsOnThisPage.tsx`: `check:feature-integration` reads a `*Page.tsx` under `pages/` as a
		// route and fails the gate when `App.tsx` does not mount it.
		const rail = frontend('src/pages/docs/DocsOutline.tsx');

		expect(rail).toContain('markdownHeadings(body, { skipLeadingTitle: true })');
		expect(rail).toContain('aria-label="On this page"');
		// One heading is not an outline, and a rail listing it is a label pretending to be one.
		expect(rail).toContain('headings.length < 2');
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
		// The card, not the page: `SkillsPage` crossed the 300-line ceiling and this is the piece of
		// it that came out. The page still has to be checked for the raw-source rendering it used to
		// do, because moving a card out is not the same as having stopped.
		const card = frontend('src/pages/skills/SkillDefinitionCard.tsx');
		const page = frontend('src/pages/skills/SkillsPage.tsx');

		// It was monospaced, reflowed mid-word, with its `##` and `-` markers left as literal
		// characters — the operator read the file rather than the document, and the headings of a
		// skill definition were nowhere in the accessibility tree.
		expect(card).toContain('markdown={body}');
		expect(card).toContain('skipLeadingTitle');
		expect(page).toContain('<SkillDefinitionCard body={selected.body} />');
		for (const source of [card, page]) {
			expect(source).not.toMatch(/<pre[^>]*>\s*\{(selected\.body|body)\}/);
			expect(source).not.toContain('whitespace-pre-wrap');
		}
	});

	test('headings and lists survive into the rendered document', () => {
		const html = renderMarkdownContent(
			'## Usage\n\n- first step\n- second step\n\n```\naidd go\n```',
			2,
		);

		// `h2`, not `h3`: the caller asked for `baseLevel` 2 and this document's shallowest heading
		// is its `##`, so that heading is the one the base level names.
		expect(html).toMatch(/<h2[^>]*>Usage /);
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
