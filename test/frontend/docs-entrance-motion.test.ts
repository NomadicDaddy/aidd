import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dir, '../..');

function source(path: string): Promise<string> {
	return Bun.file(resolve(ROOT, ...path.split('/'))).text();
}

describe('Docs entrance motion', () => {
	test('replays the route reveal for each document and staggers the composition regions', async () => {
		const page = await source('frontend/src/pages/docs/DocsPage.tsx');

		expect(page).toContain(
			'<PageRail className="page-reveal @container space-y-5" key={slug} rail={PAGE_RAIL}>',
		);
		expect(page).toContain("<div className={cn('page-reveal', docsGridClass)}>");
		expect(page).not.toContain('<div className="@container">');
	});

	test('uses the shared nested ladder and keeps reduced motion global', async () => {
		const styles = await source('frontend/src/index.css');

		for (const [child, delay] of [
			['1', '100ms'],
			['2', '140ms'],
			['3', '180ms'],
		] as const) {
			expect(styles).toContain(
				`.page-reveal > .page-reveal > *:nth-child(${child}) {\n\tanimation-delay: ${delay};\n}`,
			);
		}
		expect(styles).toContain('.page-reveal > .page-reveal {');
		expect(styles).toContain('@media (prefers-reduced-motion: reduce)');
		expect(styles).toContain('animation-delay: 0ms !important;');
		expect(styles).toContain('animation-duration: 0.01ms !important;');
	});
});
