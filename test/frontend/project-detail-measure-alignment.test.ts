import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';

const srcRoot = join(process.cwd(), 'frontend', 'src');

function read(...segments: string[]): Promise<string> {
	return Bun.file(join(srcRoot, ...segments)).text();
}

describe('Project Detail measure alignment', () => {
	test('puts shared filter chrome on the same measure as its controls', async () => {
		const toolbar = await read('components', 'shared', 'FilterToolbar.tsx');

		expect(toolbar).toContain("from '../../lib/contentRails.ts'");
		expect(toolbar).toContain('const rail = useContentRail();');
		expect(toolbar).toContain('data-content-rail={rail}');
		expect(toolbar).not.toContain('contentRailClass');
		expect(toolbar).not.toContain('grid max-w-[80rem]');
		expect(toolbar).not.toContain('flex max-w-[80rem] items-center');
	});

	test('lifts diary and artifact row measures to their containing compositions', async () => {
		const feed = await read('pages', 'diary', 'DiaryFeed.tsx');
		const entry = await read('pages', 'diary', 'DiaryEntryCard.tsx');
		const filter = await read('pages', 'diary', 'DiaryFilterBar.tsx');
		const timeline = await read('pages', 'diary', 'DiaryTimelineList.tsx');
		const artifacts = await read('pages', 'projects', 'detail', 'ArtifactsTab.tsx');
		const artifactRow = await read('pages', 'projects', 'detail', 'ArtifactInventoryRow.tsx');

		expect(feed).toContain('<div className="page-reveal max-w-[80rem] space-y-5">');
		expect(feed).not.toContain('mx-auto max-w-[61rem] space-y-5');
		expect(entry).toContain('<Card variant="panel">');
		expect(filter).toContain('<FilterToolbar');
		expect(feed).toContain('<DiaryTimelineGrid kindFilter={kind} showProject={showProject}>');
		expect(timeline).toContain(
			'<Card className="col-span-full grid grid-cols-subgrid gap-x-2 overflow-hidden p-0">',
		);
		expect(artifacts).toContain('<div className="@container space-y-4">');
		for (const page of [feed, entry, filter, timeline, artifacts]) {
			expect(page).not.toContain('contentRailClass');
		}
		expect(artifactRow).not.toContain('max-w-[61rem]');
	});

	test('gives artifact identity the slack left by intrinsic metadata', async () => {
		const artifactRow = await read('pages', 'projects', 'detail', 'ArtifactInventoryRow.tsx');

		expect(artifactRow).toContain(
			'sm:grid-cols-[minmax(8rem,11rem)_4.5rem_6rem_minmax(5.5rem,auto)]',
		);
		expect(artifactRow).toContain('max-w-full min-w-0 shrink-0 items-center');
		expect(artifactRow).toContain('truncate text-sm font-medium text-foreground');
	});

	test('caps prose while letting maturity rows fill their card', async () => {
		const notes = await read('pages', 'projects', 'detail', 'NotesTab.tsx');
		const history = await read('pages', 'projects', 'detail', 'HistoryTab.tsx');
		const maturity = await read('pages', 'projects', 'detail', 'MaturityStageBlock.tsx');
		const interview = await read('pages', 'projects', 'detail', 'InterviewQuestionRow.tsx');

		expect(notes).toContain('<Card className="@container flex flex-col gap-3">');
		expect(notes).toContain('${monoTextareaClass}');
		expect(notes).toContain('@min-[80rem]:grid-cols-[minmax(0,100ch)_minmax(0,1fr)]');
		expect(history).toContain('className={`space-y-4 ${tableColumnClass}`}');
		expect(history).not.toContain('tableMeasureClass');
		expect(history).not.toContain('max-w-[72rem]');
		expect(maturity).toContain('className="rounded-md border border-border"');
		expect(maturity).not.toContain('max-w-[61rem] rounded-md border border-border');
		expect(interview).toContain('monoEditorMeasureClass)}>');
	});

	test('converts the mono editor measure into the wrapping card face', async () => {
		const typography = await read('lib', 'typography.ts');

		expect(typography).toContain("'max-w-[calc(100ch*0.678733_+_3.5rem_+_4px)]'");
		expect(typography).not.toContain("'max-w-[calc(100ch_+_2rem)]'");
	});

	test('declares one column per table composition and lets descendants fill it', async () => {
		const audits = await read('pages', 'projects', 'detail', 'AuditsTab.tsx');
		const auditTable = await read('pages', 'projects', 'detail', 'AuditsDesktopTable.tsx');
		const reports = await read('pages', 'projects', 'detail', 'ReportsDesktopTable.tsx');
		const reportsTab = await read('pages', 'projects', 'detail', 'ReportsTab.tsx');
		const localRuns = await read(
			'components',
			'shared',
			'local-aidd-history',
			'LocalRunsTable.tsx',
		);
		const localHistory = await read('components', 'shared', 'LocalAiddHistoryPanel.tsx');
		const workingTree = await read(
			'pages',
			'projects',
			'detail',
			'workingTree',
			'WorkingTreeCard.tsx',
		);
		const workingTreeTable = await read(
			'pages',
			'projects',
			'detail',
			'workingTree',
			'WorkingTreeTable.tsx',
		);
		const repository = await read('pages', 'projects', 'detail', 'RepositoryTab.tsx');
		const repositoryInfo = await read('pages', 'projects', 'detail', 'RepositoryInfoCard.tsx');
		const repositoryRefs = await read('pages', 'projects', 'detail', 'RepositoryRefsCard.tsx');
		const profile = await read('pages', 'projects', 'detail', 'ProfileTab.tsx');
		const applicability = await read('pages', 'audits', 'tabs', 'ApplicabilityTab.tsx');

		// The column is declared by the element that owns it for its siblings — the tab root where a
		// filter toolbar and a table share one, the Card where the card is the whole composition —
		// and never by a descendant. While the measure was intrinsic, every carrier sized itself
		// from its own content, so a toolbar took its width from the table underneath it.
		expect(audits).toContain('className={`space-y-4 ${tableColumnClass}`}');
		expect(audits).not.toContain('tableMeasureClass');
		expect(auditTable).not.toContain('tableMeasureClass');
		expect(reports).toContain('<Card className="hidden p-0 xl:block">');
		expect(reports).not.toContain('tableMeasureClass');
		expect(reports).toContain('className="w-full min-w-[64rem] table-fixed text-left text-sm"');
		expect(reportsTab).toContain('className={`space-y-4 ${tableColumnClass}`}');
		expect(reportsTab).not.toContain('tableMeasureClass');
		expect(localHistory).toContain('overflow-hidden p-0 ${tableColumnClass}');
		expect(localRuns).not.toContain('tableMeasureClass');
		expect(localRuns).not.toContain('scrollerClassName={viewportFillScrollerClass}');
		expect(localRuns).toContain('<OverflowScroller ariaLabel="Local runs"');
		expect(workingTree).toContain('@container p-0 ${tableColumnClass}');
		expect(workingTree).not.toContain('tableMeasureClass');
		// The scroller draws no chrome and holds no toolbar; its Card above owns the column.
		expect(workingTreeTable).not.toContain('tableMeasureClass');
		expect(workingTreeTable).toContain('scrollerClassName={viewportFillScrollerClass}');
		expect(repository).toContain('<div className="space-y-4">');
		expect(repository).not.toContain('contentRailClass');
		expect(repositoryInfo).toContain(
			'<Card className={`@container flex flex-col gap-5 ${tableColumnClass}`}>',
		);
		expect(repositoryRefs).toContain('<Card className={`@container ${tableColumnClass}`}>');
		expect(profile).toContain(
			'<div className={`@container/profile space-y-4 ${tableColumnClass}`}>',
		);
		expect(applicability).toContain('className={`space-y-4 ${tableColumnClass}`}');
	});
});
