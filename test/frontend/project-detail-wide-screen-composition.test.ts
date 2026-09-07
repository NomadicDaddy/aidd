import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';

const frontendRoot = join(process.cwd(), 'frontend', 'src');

function source(...segments: string[]): Promise<string> {
	return Bun.file(join(frontendRoot, ...segments)).text();
}

function detail(file: string): Promise<string> {
	return source('pages', 'projects', 'detail', file);
}

describe('Project Detail wide-screen composition', () => {
	test('switches Overview composition from the panel width', async () => {
		const page = await source('pages', 'projects', 'ProjectDetailPage.tsx');
		const stages = await detail('MaturityStageBlock.tsx');

		expect(page).toContain('<div className="@container space-y-4">');
		expect(page).not.toContain('@min-[80rem]:grid-cols-3');
		expect(page).not.toContain('@min-[80rem]:col-span-2');
		expect(page).not.toContain('xl:grid-cols-3');
		expect(stages).not.toContain('max-w-[61rem] rounded-md border border-border');
	});

	test('keeps run tables on one bounded outer-card edge', async () => {
		const runs = await detail('RunsTab.tsx');

		expect(runs.match(/<div className="space-y-4">/gu)).toHaveLength(2);
		expect(runs).not.toContain('contentRailClass');
	});

	test('places Code search beside the tree it filters', async () => {
		const code = await detail('CodeTab.tsx');
		const aside = code.indexOf('<aside');
		const search = code.indexOf('name="projectCodeSearch"');
		const tree = code.indexOf('<CodeFileTree');

		expect(aside).toBeGreaterThan(-1);
		expect(search).toBeGreaterThan(aside);
		expect(search).toBeLessThan(tree);
		expect(code.slice(0, aside)).not.toContain('name="projectCodeSearch"');
	});

	test('declares reading, bounded inventory, and full data rails by tab intent', async () => {
		const [diary, artifacts, groups, interview, reports, reportTable] = await Promise.all([
			detail('DiaryTab.tsx'),
			detail('ArtifactsTab.tsx'),
			detail('ArtifactGroups.tsx'),
			detail('InterviewTab.tsx'),
			detail('ReportsTab.tsx'),
			detail('ReportsDesktopTable.tsx'),
		]);

		expect(diary).toContain('filterHeader={<TabIntro title="Diary" />}');
		expect(diary).not.toContain('contentRailClass');
		expect(artifacts).toContain('<div className="@container space-y-4">');
		expect(artifacts).not.toContain('contentRailClass');
		expect(groups).toContain('grid grid-flow-dense items-start');
		expect(groups).toContain('[&[open]]:col-span-full');
		expect(artifacts).not.toContain('@min-[80rem]:grid-cols-2');
		expect(interview).toContain('<div className="@container space-y-4">');
		expect(reports).toContain('tableColumnClass');
		expect(reports).not.toContain('tableMeasureClass');
		expect(reportTable).toContain('<col className="w-28" />');
		expect(reportTable).toContain('<col />');
		expect(reportTable).not.toContain('tableMeasureClass');
	});

	test('retains Repository container-aware wide and narrow compositions', async () => {
		const repository = await detail('RepositoryInfoCard.tsx');

		expect(repository).toContain(
			'<Card className={`@container flex flex-col gap-5 ${tableColumnClass}`}>',
		);
		expect(repository).toContain('@min-[48rem]:flex-row');
		expect(repository).toContain('@min-[61rem]:grid-cols-');
		expect(repository).not.toContain('xl:grid-cols-');
	});
});
