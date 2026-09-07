import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
	markdownHeadings,
	markdownSummary,
	parseMarkdownBlocks,
} from '../../frontend/src/lib/markdownBlocks.ts';
import { DOC_GROUP_ORDER, DOC_SECTIONS } from '../../frontend/src/pages/docs/docs-manifest.ts';
import { docsNeighbors } from '../../frontend/src/pages/docs/docsPagination.ts';

const DOCS_DIR = resolve(import.meta.dir, '../../frontend/content/docs');

// Routes that a doc section may legitimately document. Mirrors the app's
// help-enabled pages; keep in sync with the help-wired routes in App.tsx.
const KNOWN_ROUTES = new Set([
	'/',
	'/about',
	'/audits',
	'/director',
	'/projects',
	'/recipes',
	'/runs',
	'/scheduled',
	'/settings',
	'/skills',
	'/telemetry',
]);

// Constructs the bundled MarkdownContent renderer cannot render. Authored docs
// must avoid them so nothing degrades to raw text in the UI.
//
// Links are absent from this list because the inline pass renders them: `[text](/settings)` becomes
// a router `<Link>`. Instead of a blanket ban there is the targeted check below — the renderer
// drops an href it will not vouch for to plain text, so the constraint is on the target, not on the
// syntax.
const UNSUPPORTED: { label: string; pattern: RegExp }[] = [
	{ label: 'images', pattern: /!\[[^\]]*\]\(/ },
	{ label: 'fenced code blocks', pattern: /^```/m },
	{ label: 'raw HTML', pattern: /<[a-zA-Z/]/ },
	{ label: 'headings deeper than h3', pattern: /^#{4,}\s/m },
];

function docFiles(): string[] {
	return readdirSync(DOCS_DIR).filter((name) => name.endsWith('.md'));
}

describe('docs content', () => {
	test('every manifest slug has a markdown file and vice versa', () => {
		const fileSlugs = new Set(docFiles().map((name) => name.replace(/\.md$/, '')));
		const manifestSlugs = new Set(DOC_SECTIONS.map((section) => section.slug));
		expect([...manifestSlugs].sort()).toEqual([...fileSlugs].sort());
	});

	test('every section belongs to a known group', () => {
		for (const section of DOC_SECTIONS) {
			expect(DOC_GROUP_ORDER).toContain(section.group);
		}
	});

	test('keeps pagination within the documents exposed by the docs rail', () => {
		const gettingStarted = DOC_SECTIONS.find((section) => section.slug === 'getting-started');
		const pipelines = DOC_SECTIONS.find((section) => section.slug === 'pipelines');
		const faq = DOC_SECTIONS.find((section) => section.slug === 'faq');
		expect(docsNeighbors('getting-started')).toEqual({
			next: pipelines,
			previous: undefined,
		});
		expect(docsNeighbors('pipelines')).toEqual({
			next: faq,
			previous: gettingStarted,
		});
		expect(docsNeighbors('glossary')).toEqual({
			next: undefined,
			previous: faq,
		});
		expect(docsNeighbors('dashboard')).toEqual({ next: undefined, previous: undefined });
		expect(docsNeighbors('missing')).toEqual({ next: undefined, previous: undefined });
	});

	test('every section route maps to a known app route', () => {
		for (const section of DOC_SECTIONS) {
			if (section.route !== undefined) expect(KNOWN_ROUTES.has(section.route)).toBe(true);
		}
	});

	test('each doc parses into blocks and starts with a heading', () => {
		for (const name of docFiles()) {
			const markdown = readFileSync(resolve(DOCS_DIR, name), 'utf8');
			const blocks = parseMarkdownBlocks(markdown);
			expect(blocks.length).toBeGreaterThan(0);
			expect(blocks[0]).toMatchObject({ level: 1, type: 'heading' });
		}
	});

	test('each document contributes its own lead summary to the page header', () => {
		const summaries = docFiles().map((name) => {
			const markdown = readFileSync(resolve(DOCS_DIR, name), 'utf8');
			const summary = markdownSummary(markdown);
			expect(summary).toBeString();
			expect(summary?.length).toBeGreaterThan(0);
			return summary;
		});

		expect(new Set(summaries).size).toBe(summaries.length);
	});

	test('named options use explicit definition blocks across the corpus', () => {
		const expectedCounts = new Map([
			['audits.md', 3],
			['dashboard.md', 11],
			['getting-started.md', 7],
			['glossary.md', 27],
			['pipelines.md', 4],
			['projects.md', 20],
			['recipes.md', 6],
			['runs.md', 5],
			['scheduled-tasks.md', 7],
			['settings.md', 22],
			['skills.md', 5],
			['telemetry.md', 8],
		]);
		const expectedGroupCounts = new Map([
			['audits.md', 1],
			['dashboard.md', 2],
			['getting-started.md', 1],
			['glossary.md', 5],
			['pipelines.md', 1],
			['projects.md', 2],
			['recipes.md', 2],
			['runs.md', 1],
			['scheduled-tasks.md', 2],
			['skills.md', 2],
		]);

		for (const name of docFiles()) {
			const markdown = readFileSync(resolve(DOCS_DIR, name), 'utf8');
			const definitionBlocks = parseMarkdownBlocks(markdown).filter(
				(block) => block.type === 'definitions',
			);
			const definitions = definitionBlocks.flatMap((block) => block.entries);
			const expectedGroupCount = expectedGroupCounts.get(name);
			expect(definitions).toHaveLength(expectedCounts.get(name) ?? 0);
			if (expectedGroupCount !== undefined)
				expect(definitionBlocks).toHaveLength(expectedGroupCount);
			expect(markdown).not.toMatch(/^- \*\*[^*]+\*\*:/m);
		}
	});

	test('Scheduled tasks exposes task-oriented outline anchors', () => {
		const markdown = readFileSync(resolve(DOCS_DIR, 'scheduled-tasks.md'), 'utf8');

		expect(markdownHeadings(markdown, { skipLeadingTitle: true })).toEqual([
			{ depth: 0, id: 'choose-a-project-scope', text: 'Choose a project scope' },
			{ depth: 0, id: 'set-cadence-and-permissions', text: 'Set cadence and permissions' },
			{ depth: 0, id: 'review-occurrences', text: 'Review occurrences' },
			{ depth: 0, id: 'pause-resume-or-archive', text: 'Pause, resume, or archive' },
			{
				depth: 0,
				id: 'manage-automatic-director-cycles',
				text: 'Manage automatic Director cycles',
			},
		]);
	});

	test('docs use only the supported markdown subset', () => {
		const offenders: string[] = [];
		for (const name of docFiles()) {
			const markdown = readFileSync(resolve(DOCS_DIR, name), 'utf8');
			for (const { label, pattern } of UNSUPPORTED) {
				if (pattern.test(markdown)) offenders.push(`${name}: ${label}`);
			}
		}
		expect(offenders).toEqual([]);
	});

	test('every doc link points somewhere the renderer will actually link to', () => {
		// `MarkdownContent.safeHref` admits `/…`, `#…` and `http(s)://…` and renders anything else as
		// plain text, so an unroutable target fails silently: the words stay on the page and only the
		// link is gone. An internal target has a second way to fail — `/setttings` is a perfectly
		// valid `<Link>` to the not-found page — so those are checked against the app's real routes,
		// which is the same set the section metadata above is held to.
		//
		// `/docs/:slug` is a route like any other, but a parameterized one, so membership is decided
		// by the manifest rather than by the fixed list above. A cross-reference between two doc
		// sections is the most natural link a doc can contain and the easiest one to mistype.
		const docSlugs = new Set(DOC_SECTIONS.map((section) => section.slug));

		const offenders: string[] = [];
		for (const name of docFiles()) {
			const markdown = readFileSync(resolve(DOCS_DIR, name), 'utf8');
			for (const [, target] of markdown.matchAll(/(?<!!)\[[^\]]+\]\(([^)\s]+)\)/g)) {
				if (target === undefined) continue;
				if (/^https?:\/\//i.test(target) || target.startsWith('#')) continue;
				if (!target.startsWith('/')) {
					offenders.push(`${name}: ${target} renders as plain text`);
					continue;
				}
				const docSlug = /^\/docs\/([^/#?]+)$/.exec(target)?.[1];
				if (docSlug !== undefined) {
					if (!docSlugs.has(docSlug))
						offenders.push(`${name}: no doc section ${docSlug}`);
					continue;
				}
				if (!KNOWN_ROUTES.has(target))
					offenders.push(`${name}: ${target} is not an app route`);
			}
		}
		expect(offenders).toEqual([]);
	});
});
