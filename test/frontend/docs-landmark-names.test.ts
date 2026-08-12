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
		const [layout, page] = await Promise.all([
			readSource('components/layout/AppLayout.tsx'),
			readSource('pages/docs/DocsPage.tsx'),
		]);

		expect(asideLabels(layout)).toEqual([APPLICATION_LANDMARK]);
		expect(asideLabels(page)).toEqual([DOCUMENTATION_LANDMARK, OUTLINE_LANDMARK]);
	});

	test('keeps visible complementary landmarks unique in every responsive composition', async () => {
		const [layout, page] = await Promise.all([
			readSource('components/layout/AppLayout.tsx'),
			readSource('pages/docs/DocsPage.tsx'),
		]);
		const application = requiredLabel(asideLabels(layout), 0);
		const documentation = requiredLabel(asideLabels(page), 0);
		const outline = requiredLabel(asideLabels(page), 1);
		const mobileCompact = [application, documentation];
		const desktopTwoAside = [application, documentation];
		const desktopThreeAside = [application, documentation, outline];

		expectUniqueLandmarks(mobileCompact);
		expectUniqueLandmarks(desktopTwoAside);
		expectUniqueLandmarks(desktopThreeAside);
	});

	test('preserves the compact disclosure and the two Docs layout thresholds', async () => {
		const page = await readSource('pages/docs/DocsPage.tsx');

		expect(page).toContain('<DocsSidebar instance="compact" />');
		expect(page).toContain('@min-[45rem]:hidden');
		expect(page).toContain('@min-[45rem]:block');
		expect(page).toContain('@min-[61rem]:block');
	});
});
