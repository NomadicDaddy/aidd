import { describe, expect, test } from 'bun:test';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dir, '../..');

function read(path: string): Promise<string> {
	return Bun.file(join(ROOT, path)).text();
}

describe('the docs rail groups in the accessibility tree, not just on screen', () => {
	test('one nav per group, mirroring the shell rail', async () => {
		const docs = await read('frontend/src/pages/docs/DocsSidebar.tsx');
		const shell = await read('frontend/src/components/layout/SidebarNav.tsx');

		// The shell rail is the reference: it emits `<nav aria-label={group.label}>` per group.
		// The docs rail used one `<nav>` around all three, so GETTING STARTED / PAGES / REFERENCE
		// were plain text with no relationship to the lists beneath them — sixteen links announced
		// under one undifferentiated name.
		expect(shell).toContain('<nav aria-label={group.label}');
		expect(docs.match(/<nav aria-label=/g)).toHaveLength(1);
		expect(docs).toContain('DOC_GROUP_ORDER.map((group)');
		// The one landmark in source sits inside the group map, so one renders per group.
		expect(docs.indexOf('<nav aria-label=')).toBeGreaterThan(
			docs.indexOf('DOC_GROUP_ORDER.map'),
		);
	});

	test('the two simultaneous copies stay distinguishable', async () => {
		const docs = await read('frontend/src/pages/docs/DocsSidebar.tsx');
		const page = await read('frontend/src/pages/docs/DocsPage.tsx');

		// The page renders the compact disclosure and the `lg` sidebar at once. Three landmarks
		// became six, so the qualifier has to compose with the group name rather than replace it —
		// duplicate landmark names are as unhelpful as none.
		expect(docs).toContain('aria-label={instance ? `${group} (${instance})` : group}');
		expect(page).toContain('<DocsSidebar instance="compact" />');
		expect(page).toContain('<DocsSidebar />');
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
