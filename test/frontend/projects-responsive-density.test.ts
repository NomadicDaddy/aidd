import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const frontendSource = join(process.cwd(), 'frontend', 'src');

function read(relativePath: string): Promise<string> {
	return readFile(join(frontendSource, ...relativePath.split('/')), 'utf8');
}

function stripComments(source: string): string {
	return source.replaceAll(/\/\*[\s\S]*?\*\//g, '').replaceAll(/\/\/[^\n]*/g, '');
}

describe('Projects responsive density', () => {
	test('keeps a shrinkable single card track below the supported card width', async () => {
		const cardView = stripComments(await read('pages/projects/ProjectsCardView.tsx'));

		expect(cardView).toContain('className="@container"');
		expect(cardView).toContain(
			'grid grid-cols-1 gap-4 @min-[30rem]:grid-cols-[repeat(auto-fill,minmax(30rem,1fr))]',
		);
		expect(cardView).not.toContain('@min-[110rem]:gap-2');
		expect(cardView).not.toContain(
			'className="grid grid-cols-[repeat(auto-fill,minmax(30rem,1fr))] gap-4"',
		);
	});

	test('accounts for card padding in the two-column metric threshold', async () => {
		const metrics = stripComments(await read('pages/projects/ProjectCardMetrics.tsx'));

		expect(metrics).toContain('@min-[22rem]:grid-cols-2');
		expect(metrics).not.toContain('@min-[32rem]:grid-cols-2');
	});

	test('visibly names the two compact project-state indicators', async () => {
		const card = stripComments(await read('pages/projects/ProjectCard.tsx'));

		expect(card).toContain('<span className={indicatorLabelClass}>Maturity</span>');
		expect(card).toContain('<span className={indicatorLabelClass}>Artifacts</span>');
		expect(card).toContain('className="flex items-stretch gap-3"');
		expect(card).toContain('centerCaption={`${Math.max(stageIndex, 1)}/${totalStages}`}');
		expect(card).toContain('showCenterLabel');
		expect(card).toContain('className="flex flex-1 items-center"');
	});

	test('caps Summary without constraining the Edit facets scroller', async () => {
		const matrix = stripComments(
			await read('pages/projects/profileMatrix/ProfileMatrixTable.tsx'),
		);

		expect(matrix).toContain('<Card className="hidden p-0 xl:block">');
		expect(matrix).not.toContain('contentRailClass');
	});
});
