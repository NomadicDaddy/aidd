import { describe, expect, test } from 'bun:test';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dir, '../..');

function read(path: string): Promise<string> {
	return Bun.file(join(ROOT, path)).text();
}

describe('the docs rail groups in the accessibility tree, not just on screen', () => {
	test('one nav per documentation-owned group without mirroring the shell rail', async () => {
		const docs = await read('frontend/src/pages/docs/DocsSidebar.tsx');
		const manifest = await read('frontend/src/pages/docs/docs-manifest.ts');

		// Guides and Reference are documentation concepts. The shell remains the sole owner of its
		// Overview, Activity, Catalog, and System groups and their destination labels.
		expect(manifest).toContain("{ label: 'Guides', slugs: ['getting-started', 'pipelines'] }");
		expect(manifest).toContain("{ label: 'Reference', slugs: ['faq', 'glossary'] }");
		expect(docs.match(/<nav\s+aria-label=/g)).toHaveLength(1);
		expect(docs).toContain('DOCS_SIDEBAR_GROUPS.map((group)');
		expect(docs).not.toContain('DOC_GROUP_ORDER');
		// The one landmark in source sits inside the group map, so one renders per group.
		expect(docs.indexOf('<nav\n')).toBeGreaterThan(docs.indexOf('DOCS_SIDEBAR_GROUPS.map'));
	});

	test('the two simultaneous copies stay distinguishable', async () => {
		const docs = await read('frontend/src/pages/docs/DocsSidebar.tsx');
		const navigation = await read('frontend/src/pages/docs/DocsNavigationRail.tsx');

		// The page renders the compact disclosure and the wide sidebar at once. The qualifier has
		// to compose with the group name rather than replace it —
		// duplicate landmark names are as unhelpful as none.
		expect(docs).toContain(
			'aria-label={instance ? `${group.label} (${instance})` : group.label}',
		);
		expect(navigation).toContain('<DocsSidebar instance="compact" />');
		expect(navigation).toContain('<DocsSidebar framed />');
	});
});

describe('punctuation stays against a glyph', () => {
	test('no padded inline chip is followed by punctuation', async () => {
		const offenders: string[] = [];

		for await (const relative of new Bun.Glob('frontend/src/**/*.tsx').scan(ROOT)) {
			const file = relative.replaceAll('\\', '/');
			const source = await read(file);
			// A chip with horizontal padding, then a full stop. The stop lands outside the chip's
			// box and floats ~5px clear of the text it belongs to, reading as a stray mark.
			for (const [match] of source.matchAll(
				/<code className="[^"]*px-[^"]*">[\s\S]{0,160}?<\/code>\s*[.,;:!?](?=\s|$)/g,
			)) {
				offenders.push(`${file}: ${match.slice(-40).replaceAll('\n', ' ')}`);
			}
		}
		expect(offenders).toEqual([]);
	});

	test('the 404 sentence ends on prose rather than on the path chip', async () => {
		const page = await read('frontend/src/pages/notFound/NotFoundPage.tsx');

		expect(page).toContain('No page is registered at');
		expect(page).toContain('on this instance.');
	});
});
