import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const FRONTEND_ROOT = resolve(import.meta.dir, '../../frontend/src');

function source(path: string): Promise<string> {
	return readFile(resolve(FRONTEND_ROOT, ...path.split('/')), 'utf8');
}

describe('container-aware desktop presentations', () => {
	test('dashboard cards switch only when their own content fits', async () => {
		const queue = await source('pages/dashboard/DirectorQueueCard.tsx');
		const summary = await source('pages/dashboard/FeatureSummaryRows.tsx');

		expect(queue).toContain('<Card className="@container" variant="panel">');
		expect(queue).toContain('grid grid-cols-[minmax(0,1fr)] gap-3 @min-[44rem]:grid-cols-2');
		expect(queue).not.toContain('lg:grid-cols-2');
		expect(summary).toContain('<div className="@container">');
		expect(summary).toContain('hidden px-2 @min-[44rem]:block');
		expect(summary).toContain('space-y-2 @min-[44rem]:hidden');
		expect(summary).not.toContain('overflow-y-auto @min-[44rem]:hidden');
		expect(summary).not.toMatch(/\blg:(?:block|hidden)\b/u);
	});

	test('project inventories and profile facets switch on their content columns', async () => {
		const features = await source('pages/projects/detail/FeaturesTab.tsx');
		const featureTable = await source('pages/projects/detail/FeaturesDesktopTable.tsx');
		const profile = await source('pages/projects/detail/ProfileTab.tsx');

		expect(features).toContain('@min-[61rem]:hidden');
		expect(featureTable).toContain('hidden max-w-[104rem] @min-[61rem]:block');
		expect(featureTable).not.toMatch(/\b2xl:w-/u);
		expect(profile).toContain('@container/profile');
		expect(profile).toContain('@container/editor');
		expect(profile).toContain('columns-1 gap-4 @min-[40rem]/editor:columns-2');
		expect(profile).toContain('break-inside-avoid');
		expect(profile).not.toMatch(/\blg:(?:block|hidden|grid-cols)/u);
	});

	test('repository layouts use card width for every table, grid, and stack handoff', async () => {
		const info = await source('pages/projects/detail/RepositoryInfoCard.tsx');
		const refs = await source('pages/projects/detail/RepositoryRefsCard.tsx');
		const workingTree = await source('pages/projects/detail/workingTree/WorkingTreeCard.tsx');
		const workingTreeList = await source(
			'pages/projects/detail/workingTree/WorkingTreeList.tsx',
		);
		const workingTreeTable = await source(
			'pages/projects/detail/workingTree/WorkingTreeTable.tsx',
		);

		expect(info).toContain(
			'<Card className={`@container flex flex-col gap-5 ${tableColumnClass}`}>',
		);
		expect(info).toContain('@min-[61rem]:grid-cols-');
		expect(info).not.toMatch(/\b(?:xl|2xl):/u);
		expect(refs).toContain('<Card className={`@container ${tableColumnClass}`}>');
		expect(refs).toContain('@min-[61rem]:grid-cols-2 @min-[80rem]:grid-cols-4');
		expect(workingTree).toContain('@min-[48rem]:block');
		expect(workingTree).toContain('@min-[48rem]:hidden');
		expect(workingTreeList).not.toMatch(/\bxl:/u);
		expect(workingTreeTable).not.toMatch(/\bxl:/u);
	});
});
