import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

const frontendRoot = resolve(import.meta.dir, '../../frontend/src');

function source(path: string): Promise<string> {
	return Bun.file(resolve(frontendRoot, ...path.split('/'))).text();
}

describe('page rails and principal children share intentional measures', () => {
	test('keeps the three top-level catalog pages on the full rail', async () => {
		const [audits, recipes, skills] = await Promise.all([
			source('pages/audits/AuditsPage.tsx'),
			source('pages/recipes/RecipesPage.tsx'),
			source('pages/skills/SkillsPage.tsx'),
		]);

		// All three now reach the full rail the same way — by naming what they hold. Two of them
		// named the tier instead, which is the same rail until the catalog policy changes and only
		// the page that declared its content type follows.
		for (const page of [audits, recipes, skills]) {
			expect(page).toContain('const PAGE_RAIL = pageRailByContentType.catalog;');
		}
	});

	test('lets About structure fill its reading rail while prose keeps its own measure', async () => {
		const [card, page] = await Promise.all([
			source('components/ui/card.tsx'),
			source('pages/about/AboutPage.tsx'),
		]);

		expect(page).toContain('<Card className="@container" variant="panel">');
		expect(page).not.toContain('proseMeasureCardClass');
		// The measure arrives with the slot rather than being reapplied per page: the
		// identity sentence is the header description, and card.tsx is where that track
		// gets its reading width. A page that hand-rolls the class beside the slot ends
		// up with two muted registers, which is what this page used to render.
		expect(page).not.toContain('${proseMeasureClass}');
		expect(card).toContain("'mt-1 text-xs text-muted-foreground',");
		expect(card).toContain('proseMeasureClass,');
		expect(card).toContain('descriptionClassName,');
	});

	test('uses the Card chrome the prose-card measure actually owns', async () => {
		const [card, typography] = await Promise.all([
			source('components/ui/card.tsx'),
			source('lib/typography.ts'),
		]);

		expect(card).toContain("'rounded-xl border p-4 transition-");
		expect(typography).toContain(
			"export const proseMeasureCardClass = 'max-w-[calc(46ch*0.875_+_2rem)]'",
		);
		expect(typography).toContain(
			"export const smallProseInsetMeasureClass = 'max-w-[calc(46ch+2rem)]'",
		);
	});

	test('keeps every principal Telemetry region on the page rail', async () => {
		const page = await source('pages/telemetry/TelemetryPage.tsx');

		expect(page).toContain('const PAGE_RAIL = pageRailByContentType.data;');
		expect(page).toContain('<Card className="flex flex-col gap-3">');
		expect(page).not.toContain('tableMeasureClass');
	});
});
