import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const FRONTEND_SOURCE = resolve(import.meta.dir, '../../frontend/src');

function readSource(path: string): Promise<string> {
	return readFile(resolve(FRONTEND_SOURCE, path), 'utf8');
}

const APPLICATION_LANDMARK = 'Application navigation';
const DOCUMENTATION_LANDMARK = 'Documentation navigation';
const OUTLINE_LANDMARK = 'On this page';

function asideLabels(source: string): string[] {
	return [...source.matchAll(/<aside\s+aria-label="([^"]+)"/g)].map((match) => {
		const label = match[1];
		if (!label) throw new Error('Expected every matched aside to have an accessible name');
		return label;
	});
}

function navLabels(source: string): string[] {
	return [...source.matchAll(/<nav\s+aria-label="([^"]+)"/g)].map((match) => {
		const label = match[1];
		if (!label) throw new Error('Expected every matched nav to have an accessible name');
		return label;
	});
}

function expectUniqueLandmarks(names: string[]) {
	expect(new Set(names).size).toBe(names.length);
}

function requiredLabel(labels: string[], index: number): string {
	const label = labels[index];
	if (!label) throw new Error(`Expected complementary landmark ${index + 1}`);
	return label;
}

describe('Docs complementary landmark names', () => {
	test('names the application, documentation, and outline regions by purpose', async () => {
		const [layout, navigation, outline, page] = await Promise.all([
			readSource('components/layout/AppLayout.tsx'),
			readSource('pages/docs/DocsNavigationRail.tsx'),
			readSource('pages/docs/DocsOutline.tsx'),
			readSource('pages/docs/DocsPage.tsx'),
		]);

		expect(asideLabels(layout)).toEqual([APPLICATION_LANDMARK]);
		expect(asideLabels(navigation)).toEqual([DOCUMENTATION_LANDMARK]);
		// The outline is one landmark, named in the component that owns it. The page used to wrap it
		// in a complementary region carrying the same name, which was invisible only because the
		// wrapper was hidden below the outline's own track. The page's job here is placement.
		expect(asideLabels(page)).toEqual([]);
		expect(navLabels(outline)).toEqual([OUTLINE_LANDMARK]);
	});

	test('keeps visible landmarks unique in every responsive composition', async () => {
		const [layout, navigation, outlineSource] = await Promise.all([
			readSource('components/layout/AppLayout.tsx'),
			readSource('pages/docs/DocsNavigationRail.tsx'),
			readSource('pages/docs/DocsOutline.tsx'),
		]);
		const application = requiredLabel(asideLabels(layout), 0);
		const documentation = requiredLabel(asideLabels(navigation), 0);
		const outline = requiredLabel(navLabels(outlineSource), 0);
		// The outline is reachable at every width now — a disclosure below its own track, the rail
		// above it — so all three compositions carry all three names and none of them collides.
		const mobileCompact = [application, documentation, outline];
		const tabletTwoColumn = [application, documentation, outline];
		const desktopThreeColumn = [application, documentation, outline];

		expectUniqueLandmarks(mobileCompact);
		expectUniqueLandmarks(tabletTwoColumn);
		expectUniqueLandmarks(desktopThreeColumn);
	});

	test('preserves the compact disclosure and the two Docs layout thresholds', async () => {
		const [navigation, outline, page] = await Promise.all([
			readSource('pages/docs/DocsNavigationRail.tsx'),
			readSource('pages/docs/DocsOutline.tsx'),
			readSource('pages/docs/DocsPage.tsx'),
		]);

		expect(navigation).toContain('<DocsSidebar instance="compact" />');
		expect(navigation).toContain('@min-[45rem]:hidden');
		expect(navigation).toContain('@min-[45rem]:block');
		// The outline swaps presentation at the width where its own track appears, and the page
		// places it: the article's column while there are two, the third one once there are three.
		expect(outline).toContain('@min-[61rem]:hidden');
		expect(outline).toContain('@min-[61rem]:grid');
		expect(page).toContain('min-w-0 space-y-6 @min-[45rem]:col-start-2 @min-[61rem]:contents');
		expect(page).toContain(
			'sticky top-[var(--app-topbar-height,0px)] z-10 self-start @min-[61rem]:top-4 @min-[61rem]:col-start-3',
		);
	});
});
