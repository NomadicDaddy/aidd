import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { parseMarkdownBlocks } from '../../frontend/src/lib/markdownBlocks.ts';
import { DOC_GROUP_ORDER, DOC_SECTIONS } from '../../frontend/src/pages/docs/docs-manifest.ts';

const DOCS_DIR = resolve(import.meta.dir, '../../frontend/content/docs');

// Routes that a doc section may legitimately document. Mirrors the app's
// help-enabled pages; keep in sync with the help-wired routes in App.tsx.
const KNOWN_ROUTES = new Set([
	'/',
	'/projects',
	'/runs',
	'/director',
	'/audits',
	'/skills',
	'/recipes',
	'/telemetry',
	'/settings',
]);

// Constructs the bundled MarkdownContent renderer cannot render. Authored docs
// must avoid them so nothing degrades to raw text in the UI.
const UNSUPPORTED: { label: string; pattern: RegExp }[] = [
	{ label: 'images', pattern: /!\[[^\]]*\]\(/ },
	{ label: 'links', pattern: /\[[^\]]+\]\([^)]+\)/ },
	{ label: 'fenced code blocks', pattern: /^```/m },
	{ label: 'tables', pattern: /(^\s*\|)|(\|.*\|)/m },
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
});
