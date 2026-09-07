import { describe, expect, test } from 'bun:test';

async function source(path: string): Promise<string> {
	return await Bun.file(path).text();
}

describe('viewport-sized regions', () => {
	test('lets the command palette result list respond to viewport height', async () => {
		const palette = await source('frontend/src/components/shared/CommandPalette.tsx');

		expect(palette).toContain('max-h-[min(60vh,44rem)]');
		expect(palette).not.toContain('max-h-[min(27rem,58vh)]');
	});

	test('keeps the ingest candidates in the page scroll region', async () => {
		const ingest = await source('frontend/src/pages/projects/ProjectIngestLane.tsx');

		expect(ingest).toContain('data-ingest-candidates=""');
		expect(ingest).toContain('className="grid gap-2 @min-[60rem]:grid-cols-2"');
		expect(ingest).not.toContain('max-h-[28rem]');
		expect(ingest).not.toContain('overflow-auto');
	});

	test('gives expanded scheduled cards the full desktop results rail', async () => {
		const card = await source('frontend/src/pages/scheduled/ScheduledTaskCard.tsx');

		expect(card).toContain("expanded && 'lg:col-span-full'");
		expect(card).not.toContain('setWidened');
	});
});
