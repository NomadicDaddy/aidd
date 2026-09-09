import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
	markdownHeadings,
	parseMarkdownBlocks,
	plainInlineText,
} from '../../frontend/src/lib/markdownBlocks.ts';
import {
	activeOutlineHeadingId,
	shouldRenderDocsOutline,
} from '../../frontend/src/pages/docs/docsOutlineState.ts';

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
		// `measure` is required and has no default, so the harness supplies the majority answer and
		// lets a caller override it. The two directions are asserted against each other below rather
		// than assumed here.
		`const content = createElement(MarkdownContent, ${JSON.stringify({ measure: 'prose', ...props })});`,
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
		expect(blocks).toEqual([
			{ items: ['first', 'second'], ordered: true, start: 1, type: 'list' },
		]);
	});

	test('folds hanging-indented continuation lines into the current item', () => {
		const blocks = parseMarkdownBlocks('1. first line\n   wrapped tail\n2. second');
		expect(blocks).toEqual([
			{
				items: ['first line wrapped tail', 'second'],
				ordered: true,
				start: 1,
				type: 'list',
			},
		]);
	});

	test('keeps indented continuation paragraphs inside one ordered list', () => {
		const blocks = parseMarkdownBlocks(
			'3. third item\n\n    An indented explanation.\n    It keeps wrapping.\n\n4. fourth item',
		);

		expect(blocks).toEqual([
			{
				items: ['third item An indented explanation. It keeps wrapping.', 'fourth item'],
				ordered: true,
				start: 3,
				type: 'list',
			},
		]);
		const html = renderMarkdownContent(
			'3. third item\n\n    An indented explanation.\n\n4. fourth item',
			2,
		);
		expect(html).toContain('<ol class="ml-5 list-decimal space-y-1" start="3">');
		expect(html.match(/<ol/g)).toHaveLength(1);
	});

	test('parses aligned tables without splitting escaped or inline-code pipes', () => {
		const blocks = parseMarkdownBlocks(
			'| Name | Expression | Result |\n| :--- | :---: | ---: |\n| Alpha | `a | b` | yes |\n| Beta | a \\| b | no |',
		);

		expect(blocks).toEqual([
			{
				alignments: ['left', 'center', 'right'],
				header: ['Name', 'Expression', 'Result'],
				rows: [
					['Alpha', '`a | b`', 'yes'],
					['Beta', 'a | b', 'no'],
				],
				type: 'table',
			},
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
		expect(skills).toContain('text-sm font-semibold tracking-wide text-foreground uppercase');

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

		expect(docsPage).toContain('<MarkdownContent');
		expect(docsPage).toContain('markdown={body}');
		expect(docsPage).toContain("variant={slug === 'glossary' ? 'glossary' : 'docs'}");
		expect(diaryCard).toContain('baseLevel={4}');
		expect(diaryCard).toContain('markdown={entry.bodyMd}');
		expect(diaryCard).toContain('variant="embedded"');
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
		// The chip is not `bg-muted px-0.5` with nothing vertical, however "compact" that reads.
		// Compact is the defect: the fill is 1.14:1 against the doc card it sits on, so
		// two horizontal pixels of an invisible colour left the code with neither an edge nor a
		// shape. It has both now, and the border is what carries it on a sunken panel where the
		// fill and the ground are the same token.
		expect(html).toContain(
			'rounded-sm border border-border bg-muted box-decoration-clone px-0.5 py-px font-mono text-[0.9em] [overflow-wrap:anywhere] text-foreground',
		);
		// Still not the chip idiom used for a metadata pill elsewhere: this is a run of characters
		// inside a sentence, and `py-0.5` would push the line box of every paragraph holding one.
		expect(html).not.toContain('py-0.5');
	});

	test('keeps spaced inline code legible beside punctuation at narrow widths', () => {
		const html = renderMarkdownContent('Choose `Review only`, then continue.', 2);

		expect(html.match(/<code/g)).toHaveLength(1);
		expect(html).toContain('box-decoration-clone');
		expect(html).toContain('[overflow-wrap:anywhere]');
		expect(html).toContain('</code>, then continue.');
		expect(html).not.toContain('overflow-x-auto');
	});

	test('renders explicit shortcuts through shared keycaps without consuming emphasis', () => {
		const html = renderMarkdownContent(
			'Press {{kbd:Ctrl+K}}, then {{kbd:g d}}. **Keep this emphasized.**',
			2,
		);

		expect(html.match(/<kbd/g)).toHaveLength(4);
		expect(html).toContain('<kbd');
		expect(html).toContain('>Ctrl</kbd>');
		expect(html).toContain('>K</kbd>');
		expect(html).toContain('>then</span>');
		expect(html).toContain('<strong>Keep this emphasized.</strong>');
		expect(plainInlineText('{{kbd:Ctrl+K}} and **emphasis**')).toBe('Ctrl+K and emphasis');
	});

	test('renders every getting-started shortcut as a shared keycap', () => {
		const markdown = frontend('content/docs/getting-started.md');
		const html = renderMarkdownContent(markdown, 2);

		expect(html.match(/<kbd/g)).toHaveLength(19);
		expect(html).not.toContain('{{kbd:');
		expect(html).toContain('<strong>fleet</strong>');
	});

	test('uses a larger rhythm only between consecutive paragraphs', () => {
		const html = renderMarkdownContent('First paragraph.\n\nSecond paragraph.\n\n- A list', 2);

		expect(html).toContain('[&amp;&gt;p+p]:mt-3');
		expect(html).toContain('space-y-2');
	});

	test('removes leading margin from every first block without flattening later rhythm', () => {
		for (const [markdown, tag] of [
			['## Heading', 'h2'],
			['First paragraph.', 'p'],
			['- First item', 'ul'],
		] as const) {
			const html = renderMarkdownContent(markdown, 2);

			expect(html).toContain('[&amp;&gt;*:first-child]:mt-0');
			expect(html).toMatch(new RegExp(`<div[^>]+><${tag}(?: |>)`, 'u'));
		}

		const laterHeading = renderMarkdownContent('First paragraph.\n\n## Later heading', 2);
		expect(laterHeading).toContain('mt-6 mb-2');
		expect(laterHeading).toContain('space-y-2');
	});

	test('renders a semantic contained table with inline content and alignment', () => {
		const html = renderMarkdownContent(
			'| Priority | Issue |\n| :--- | ---: |\n| **P1** | Use `MarkdownContent` |',
			2,
		);

		expect(html).toContain('group relative overflow-clip');
		expect(html).toContain('rounded-md border border-border');
		expect(html).toContain('aria-label="Markdown table"');
		expect(html).toContain('data-overflow-scroller=""');
		expect(html).toContain('<table');
		expect(html).toContain('<th');
		expect(html).toContain('scope="col"');
		expect(html).toContain('<strong>P1</strong>');
		expect(html).toContain('<code');
		expect(html).toContain('text-right');
		expect(html).not.toContain('| :--- |');
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
		// The `:` marker belongs to the authored structure. Unlike a bold-plus-colon
		// heuristic, it does not ask the surrounding items what shape this block should take.
		const bodies = [2, 3, 4].map((level) =>
			renderWithProps({ baseLevel: level, markdown: definitions }),
		);

		expect(new Set(bodies).size).toBe(1);
		expect(bodies[0]).toContain('<dl');
		expect(bodies[0]).toContain(
			'<dt aria-label="Feature" class="font-medium text-muted-foreground">Feature</dt>',
		);
		expect(bodies[0]).not.toContain('Link to term');
		expect(bodies[0]).toContain('<dd class="text-foreground">');
		expect(bodies[0]).toContain('<dl class="@container/definitions grid gap-4 pt-2 pb-4"');
		expect(bodies[0]).not.toMatch(/divide-|border-/);
		expect(bodies[0]).not.toContain('<ul');
	});

	test('definitions own reading contrast while terms preserve authored case', () => {
		const html = renderWithProps({
			baseLevel: 2,
			markdown: '`aidd-cli`\n: a definition.\n\nA **bold phrase** follows the list.',
		});

		expect(html).not.toContain('id="term-aidd-cli"');
		expect(html).toContain(
			'<dt aria-label="aidd-cli" class="font-medium text-muted-foreground"><code',
		);
		expect(html).not.toContain('uppercase');
		expect(html).toContain('<dd class="text-foreground">a definition.</dd>');
		expect(html).toContain('<strong>bold phrase</strong>');
		expect(html).toContain('</dl><p>A <strong>');
		expect(html).not.toMatch(/<dl[^>]*(?:divide-|border-)/);
		expect(html).not.toMatch(/<div[^>]*(?:divide-|border-)/);
	});

	test('definition anchors stay unique and follow the embedding namespace', () => {
		const html = renderWithProps({
			idPrefix: 'entry-7',
			markdown: 'Term\n: first definition.\nTerm\n: second definition.',
			variant: 'glossary',
		});

		expect(html).toContain('id="entry-7-term-term"');
		expect(html).toContain('id="entry-7-term-term-2"');
		expect(html.match(/<dt aria-label="Term"/g)).toHaveLength(2);
		expect(html).toContain('aria-label="Link to term Term"');
		expect(html).not.toContain('aria-label="Term Link to term Term"');
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
			'Source',
			'Initiator',
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

		const html = renderWithProps({
			baseLevel: 2,
			markdown,
			variant: 'glossary',
		});
		expect(html.match(/<dl/g)).toHaveLength(5);
		expect(html.match(/<dt/g)).toHaveLength(27);
		expect(html.match(/<dd/g)).toHaveLength(27);
		for (const group of groups) expect(html).toContain(`aria-label="${group}"`);
		for (const term of terms) {
			expect(html).toContain(`<dt aria-label="${term}"`);
			expect(html).toContain(`aria-label="Link to term ${term}"`);
		}
		expect(html).toContain('<code');
		expect(html).toContain('claude-code</code>');
	});

	test('term-definition runs use definition rows throughout the docs set', () => {
		const expectedCounts = new Map([
			['audits.md', 3],
			['dashboard.md', 13],
			['getting-started.md', 7],
			['glossary.md', 27],
			['pipelines.md', 4],
			['projects.md', 20],
			['recipes.md', 6],
			['runs.md', 7],
			['scheduled-tasks.md', 7],
			['settings.md', 22],
			['skills.md', 5],
			['telemetry.md', 8],
		]);

		for (const [name, expectedCount] of expectedCounts) {
			const markdown = frontend(`content/docs/${name}`);
			const blocks = parseMarkdownBlocks(markdown);
			const definitions = blocks.flatMap((block) =>
				block.type === 'definitions' ? block.entries : [],
			);
			expect(definitions).toHaveLength(expectedCount);
			const html = renderWithProps({ baseLevel: 2, markdown, variant: 'embedded' });
			expect(html.match(/<dt /g)).toHaveLength(expectedCount);
			expect(html.match(/<dd class="text-foreground">/g)).toHaveLength(expectedCount);
		}
	});
});

describe('running prose owns its measure', () => {
	test('the renderer projects the measure onto running prose only when asked', () => {
		const prose = renderMarkdownContent('A paragraph of prose.', 2);
		const container = renderWithProps({
			baseLevel: 2,
			markdown: 'A paragraph of prose.',
			measure: 'container',
		});

		// The mechanism, not the symptom. The measure used to be unconditional, so the three
		// surfaces that wanted their container's width cancelled it with `max-w-none` overrides
		// instead — a width decision expressed as an undo of another width decision. `measure` is
		// required precisely so neither answer is the silent one.
		expect(prose).toContain('max-w-[46ch]');
		expect(container).not.toContain('max-w-[46ch]');
		expect(container).toContain('A paragraph of prose.');
	});

	test('every markdown surface receives the cap without constraining structured blocks', () => {
		const measure = frontend('src/lib/typography.ts');
		const renderer = frontend('src/components/shared/MarkdownContent.tsx');
		// `46ch`, not `68ch`, for a 68-character measure. `ch` is the advance of `0`, which in Geist
		// Sans at 14px is 9.297px against 6.293px for the average character in these pages' prose —
		// a size-independent ratio of 1.477, so `68ch` was holding 100 characters. 68 / 1.477 = 46.
		expect(measure).toContain("export const proseMeasureClass = 'max-w-[46ch]'");

		expect(renderer).toContain('markdownRunningProseMeasureClass');
		// Skills spends the full card width while stacked, then gives the Definition card the
		// elastic track once the detail region can afford two panes. The wider card keeps its prose
		// children at the same corrected measure while letting code and tables use the extra room.
		expect(measure).toContain('export const markdownRunningProseMeasureClass =');
		expect(frontend('src/pages/skills/SkillsPage.tsx')).toContain(
			'@min-[80rem]:grid-cols-[minmax(18rem,36rem)_minmax(0,1fr)]',
		);
		const skillDefinition = frontend('src/pages/skills/SkillDefinitionCard.tsx');
		// The document track is elastic; running prose owns its measure inside the full-width card,
		// while fenced code and tables can use the remaining document width.
		expect(skillDefinition).not.toContain('monoEditorMeasureCardClass');
		expect(skillDefinition).toContain('measure="prose"');
		expect(skillDefinition).not.toContain('markdownProseMeasureClass');

		// The canonical mono-editor cap remains available to actual source-editor surfaces.
		const cap = /monoEditorMeasureCardClass = 'max-w-\[(calc\(.+?\))\]'/.exec(
			frontend('src/lib/typography.ts'),
		);
		expect(cap).not.toBeNull();
		expect(cap?.[1]).toBeDefined();
	});

	test('the doc card releases its track while running prose keeps the cap', () => {
		const page = frontend('src/pages/docs/DocsPage.tsx');

		expect(page).toContain('<Card className="min-w-0 p-3 sm:p-6 @min-[61rem]:col-start-2');
		expect(page).toContain('<MarkdownContent');
		expect(page).not.toContain('proseMeasureCardClass');
	});

	test('the markdown projection measures every running-prose block by its rendered shape', () => {
		const measure = frontend('src/lib/typography.ts');
		const projection = measure.match(
			/export const markdownRunningProseMeasureClass =\s*'([^']+)'/u,
		)?.[1];
		if (projection === undefined) throw new Error('Running-prose measure is not declared.');

		for (const selector of ['blockquote', 'ol>li', 'p', 'ul>li']) {
			expect(projection).toContain(`[&>${selector}]:max-w-[46ch]`);
		}
		expect(projection).toContain('[&>dl>div>dd]:max-w-[46ch]');
		expect(projection).not.toContain('[&>dl]:max-w-[46ch]');

		const html = renderMarkdownContent('Term\n: Definition text.', 2);
		expect(html).toContain('<dl');
		expect(html).toContain('@min-[36rem]/definitions:grid-cols-[12rem_minmax(0,1fr)]');
		expect(html).toContain('<dd class="text-foreground">Definition text.</dd>');
	});

	test('a container that wraps the prose corrects for its own face and padding', () => {
		const measure = frontend('src/lib/typography.ts');

		// Two corrections, and dropping either one leaves the measure wrong. `ch` is the advance of
		// `0` in the element's own face: on the 16px card that is not the `text-sm` the prose is set
		// in, and `14/16` is the whole of the difference. And `max-width` on a `border-box` element
		// includes padding, so the card's `p-4` was being taken out of the 68 characters instead of
		// sitting outside them.
		expect(measure).toContain(
			"export const proseMeasureCardClass = 'max-w-[calc(46ch*0.875_+_2rem)]'",
		);
	});

	test('the docs split measures the column it is splitting, not the viewport', () => {
		const page = frontend('src/pages/docs/DocsPage.tsx');
		const navigation = frontend('src/pages/docs/DocsNavigationRail.tsx');

		// `lg:` reads the viewport, and the viewport does not know how wide the rail is. At 768 the
		// same tier covered a 656px column (rail collapsed) and a 480px one (rail expanded), where
		// the sidebar would have left roughly 230px of prose beside 224px of navigation.
		expect(page).toContain('className="page-reveal @container space-y-5"');
		expect(page).toContain('@min-[45rem]:grid-cols-[14rem_minmax(0,1fr)]');
		expect(navigation).toContain('@min-[45rem]:hidden');
		expect(navigation).toContain('hidden @min-[45rem]:block');

		// Nothing on this page decides anything by viewport tier any more — a leftover `lg:` beside
		// a container query is the two answers this change exists to collapse into one. Comments
		// stripped: the note above the grid names the tier it replaced.
		const code = page.replaceAll(/\/\*[\s\S]*?\*\//g, '').replaceAll(/\/\/[^\n]*/g, '');
		expect(code).not.toContain('lg:');
		expect(navigation).not.toContain('lg:');
	});
});

describe('the outline is shared, and the width the measure releases is claimed', () => {
	test('gives every multi-section document a height-independent outline track', () => {
		expect(shouldRenderDocsOutline(0)).toBeFalse();
		expect(shouldRenderDocsOutline(1)).toBeFalse();
		expect(shouldRenderDocsOutline(2)).toBeTrue();
		expect(shouldRenderDocsOutline(20)).toBeTrue();
	});

	test('the reading position selects a stable current section', () => {
		const positions = [
			{ id: 'first', top: -180 },
			{ id: 'second', top: 16 },
			{ id: 'third', top: 420 },
		];

		expect(activeOutlineHeadingId([], 16, true)).toBeNull();
		expect(activeOutlineHeadingId(positions, 16, true)).toBe('second');
		expect(activeOutlineHeadingId(positions, -200, true)).toBe('first');
		expect(activeOutlineHeadingId(positions, 16, false)).toBeNull();
	});

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
		const renderer = frontend('src/components/shared/MarkdownContent.tsx');

		// Capping the article without giving anything the width it released made the void worse, not
		// better: 1231px of a 1962px content column at 2250x1309, against 1027px before the cap. The
		// third column is the fix, at the width where 224 + 480 + 224 + two 24px gaps still leaves
		// the article its measure. Its presence follows document structure, so a one-pixel height
		// change cannot add or remove the whole 224px track.
		expect(page).toContain('@min-[61rem]:grid-cols-[14rem_minmax(0,1fr)_14rem]');
		expect(page).toContain('shouldRenderDocsOutline(outlineHeadings.length)');
		expect(page).toContain('outlineContent !== null && DOCS_OUTLINE_GRID_CLASS');
		expect(page).toContain('if (body === undefined)');
		expect(page).toContain('<DocsOutline headings={outlineHeadings} />');
		expect(page).toContain('outlineContent === null ? null : (');
		expect(page).toContain('{outlineContent}');

		// Below that width the outline changes presentation rather than disappearing. The compact
		// `<details>` beside it lists the other documents, not this document's sections, so hiding
		// the rail left a phone with no section list at all: measured at 390x844, /docs/runs is 8
		// sections over 3.6 screens and /docs/glossary 5 over 4.1. The narrow outline stays beneath
		// the app top bar as the document scrolls; the wide rail uses its local 1rem inset.
		expect(page).toContain('min-w-0 space-y-6 @min-[45rem]:col-start-2 @min-[61rem]:contents');
		expect(page).toContain('sticky top-[var(--app-topbar-height,0px)] z-10 self-start');
		expect(page).toContain('@min-[61rem]:top-4 @min-[61rem]:col-start-3');
		expect(page).not.toContain('hidden @min-[61rem]:sticky');

		// The three-column threshold and the rail are the same 976px, because the page declares a
		// content type and the rail follows from it. They used to be 976px and 1280px, and the surplus
		// arrived as bare card beside the prose rather than as page. The two equal gaps keep the
		// outline adjacent and the prose projection holds line length.
		expect(page).not.toContain("'mx-auto grid gap-6");
		expect(page).toContain('const PAGE_RAIL = pageRailByContentType.reading;');
		expect(renderer).toContain('markdownRunningProseMeasureClass');
		expect(page).toContain(
			'<PageRail className="page-reveal @container space-y-5" key={slug} rail={PAGE_RAIL}>',
		);
	});

	test('the rail is the document, not a second navigation', () => {
		// Not `DocsOnThisPage.tsx`: `check:feature-integration` reads a `*Page.tsx` under `pages/` as a
		// route and fails the gate when `App.tsx` does not mount it.
		const page = frontend('src/pages/docs/DocsPage.tsx');
		const rail = frontend('src/pages/docs/DocsOutline.tsx');

		expect(page).toContain('markdownHeadings(body, { skipLeadingTitle: true })');
		expect(rail).toContain('<nav aria-label="On this page">');
		// The box is the declared sunken variant now, not a fill this file invents; the nav keeps
		// the landmark and wraps both presentations, so exactly one of them is named at a time.
		expect(rail).toContain('variant="sunken"');
		expect(rail).toContain('@min-[61rem]:hidden');
		// One heading is not an outline, and a rail listing it is a label pretending to be one.
		expect(rail).toContain('headings.length < 2');
		// A stacked list owns its row height instead of borrowing space from adjacent targets.
		expect(rail).toContain('touchTargetRowClass');
		expect(rail).not.toContain('touchTargetTextClass');
		expect(rail).toContain("activeHeadingId === heading.id ? 'location' : undefined");
		// The shell rail owns the one filled selection. A docs rail 30px away repeating that
		// treatment reads as a second application, so current location here is semantic plus the
		// accent indicator, carried by the shared class rather than restated inline.
		expect(rail).toContain('docsCurrentLocationClass');
		expect(rail).not.toContain('bg-accent-muted');
		expect(rail).not.toContain('shadow-sm');
		expect(rail).toContain('activeOutlineHeadingId(');
		expect(rail).toContain('documentScrollable');
		expect(rail).toContain("'relative block rounded-lg py-1.5 text-sm'");
		expect(rail).toContain('duration-150');
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
	test('the artifact viewer uses the shared renderer instead of a private component map', () => {
		const viewer = frontend('src/pages/projects/detail/ArtifactViewerDialog.tsx');

		expect(viewer).toContain(
			"import { MarkdownContent } from '../../../components/shared/MarkdownContent.tsx'",
		);
		expect(viewer).toContain('<MarkdownContent markdown={data.content} measure="prose" />');
		expect(viewer).not.toContain('ReactMarkdown');
		expect(viewer).not.toContain('remarkGfm');
		expect(viewer).not.toContain('markdownComponents');
	});

	test('Skills renders its definition through the shared renderer', () => {
		// The card, not the page: `SkillsPage` crossed the 300-line ceiling and this is the piece of
		// it that came out. The page still has to be checked for raw-source rendering,
		// because moving a card out is not the same as having stopped.
		const card = frontend('src/pages/skills/SkillDefinitionCard.tsx');
		const page = frontend('src/pages/skills/SkillsPage.tsx');

		// It was monospaced, reflowed mid-word, with its `##` and `-` markers left as literal
		// characters — the operator read the file rather than the document, and the headings of a
		// skill definition were nowhere in the accessibility tree.
		expect(card).toContain('markdown={body}');
		expect(card).toContain('variant="embedded"');
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

	test('fenced code stays in a named shared scrollport', () => {
		const html = renderMarkdownContent(`\`\`\`\n${'a'.repeat(240)}\n\`\`\``, 2);

		expect(html).toContain('aria-label="Code block"');
		expect(html).toContain('data-overflow-scroller=""');
		expect(html).toContain('max-w-full min-w-0 rounded-md bg-muted');
		expect(html).toContain('min-w-max font-mono text-xs whitespace-pre text-foreground');
	});
});

describe('MarkdownContent variants', () => {
	const doc = '# Operating aidd\n\nA concise summary.\n\n## Details\n\nTerm\n: a definition.';

	test('document preserves the authored title and summary without term anchors', () => {
		const html = renderWithProps({ baseLevel: 2, markdown: doc, variant: 'document' });

		expect(html).toContain('Operating aidd');
		expect(html).toContain('A concise summary.');
		expect(html).not.toContain('id="term-term"');
	});

	test('embedded drops only a leading h1', () => {
		const html = renderWithProps({ baseLevel: 2, markdown: doc, variant: 'embedded' });

		expect(html).not.toContain('Operating aidd');
		expect(html).toContain('A concise summary.');
		expect(html).not.toContain('id="term-term"');
		expect(
			renderWithProps({
				baseLevel: 2,
				markdown: '## Already a section\n\nBody.',
				variant: 'embedded',
			}),
		).toContain('Already a section');
	});

	test('docs drops the promoted title and summary without term anchors', () => {
		const html = renderWithProps({ baseLevel: 2, markdown: doc, variant: 'docs' });

		expect(html).not.toContain('Operating aidd');
		expect(html).not.toContain('A concise summary.');
		expect(html).toContain('Details');
		expect(html).toContain('a definition.');
		expect(html).not.toContain('id="term-term"');
	});

	test('glossary adds term anchors to the docs policy', () => {
		const html = renderWithProps({ baseLevel: 2, markdown: doc, variant: 'glossary' });

		expect(html).not.toContain('Operating aidd');
		expect(html).not.toContain('A concise summary.');
		expect(html).toContain('id="term-term"');
	});

	test('removes the retired boolean controls from the renderer and its variant consumers', () => {
		const docsPage = frontend('src/pages/docs/DocsPage.tsx');
		const docsRendererStart = docsPage.indexOf('<MarkdownContent');
		expect(docsRendererStart).toBeGreaterThan(-1);
		const docsRenderer = docsPage.slice(
			docsRendererStart,
			docsPage.indexOf('/>', docsRendererStart) + 2,
		);
		const sources = [
			frontend('src/components/shared/MarkdownContent.tsx'),
			frontend('src/pages/diary/DiaryEntryCard.tsx'),
			docsRenderer,
			frontend('src/pages/skills/SkillDefinitionCard.tsx'),
		];
		const retiredProps = [
			['definition', 'Term', 'Anchors'].join(''),
			['skip', 'Leading', 'Summary'].join(''),
			['skip', 'Leading', 'Title'].join(''),
		];

		for (const source of sources) {
			for (const retiredProp of retiredProps) expect(source).not.toContain(retiredProp);
		}
	});
});
