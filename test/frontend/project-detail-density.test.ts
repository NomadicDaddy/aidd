import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const DETAIL_ROOT = resolve(import.meta.dir, '../../frontend/src/pages/projects/detail');
const SHARED_ROOT = resolve(import.meta.dir, '../../frontend/src/components/shared');

const detail = (file: string) => readFile(resolve(DETAIL_ROOT, file), 'utf8');
const shared = (file: string) => readFile(resolve(SHARED_ROOT, file), 'utf8');

describe('project detail density contracts', () => {
	test('bounds the compact audit inventory and discloses complete row controls', async () => {
		const list = await detail('AuditsMobileList.tsx');
		const row = await detail('AuditCompactRow.tsx');
		const content = await detail('auditRowContent.tsx');

		expect(list).toContain('ariaLabel="Project audits compact inventory"');
		expect(list).toContain('scrollerClassName={viewportFillPhonePageListClass}');
		expect(list).toContain('viewportFillPhonePageRootClass');
		expect(list).toContain('gutterPx: projectDetailViewportGutterPx');
		expect(list).toContain("mode: 'page-on-phone'");
		expect(list).not.toContain('minHeightPx');
		expect(list).toContain('refreshKey: rows');
		expect(list).not.toContain('max-h-[28rem]');
		expect(list).toContain('sticky top-[var(--app-topbar-height,0px)]');
		expect(list).toContain('sm:top-px');
		expect(content).toContain('aria-expanded={expanded}');
		expect(row).toContain('Override for ${row.name}');
		expect(row).toContain('runSingle(row.name, true)');
	});

	test('inherits default content-width filter collapse and labels the graph scrollport', async () => {
		const filters = await detail('DependencyGraphFilters.tsx');
		const panels = await detail('dependencyGraphPanels.tsx');
		const toolbar = await shared('FilterToolbar.tsx');

		expect(filters).not.toContain('contentAware');
		expect(toolbar).toContain('@max-[36rem]:grid-cols-[minmax(0,1fr)_auto]');
		expect(panels).toContain('ariaLabel="Dependency graph canvas"');
		expect(panels).toContain('useViewportFill<HTMLDivElement>');
		expect(panels).toContain("floor: 'graph'");
		expect(panels).not.toContain('minHeightPx');
		expect(panels).toContain('scrollerClassName={viewportFillScrollerClass}');
		expect(panels).not.toContain('calc(100vh-');
	});

	test('switches feature density while keeping artifact groups in one stable column', async () => {
		const features = await detail('FeaturesTab.tsx');
		const featureTable = await detail('FeaturesDesktopTable.tsx');
		const artifacts = await detail('ArtifactsTab.tsx');

		expect(features).toContain(
			'<Card className="@container max-w-[104rem] overflow-hidden p-0">',
		);
		expect(features).toContain('@min-[61rem]:hidden');
		expect(featureTable).toContain('hidden max-w-[104rem] @min-[61rem]:block');
		expect(featureTable).toContain('gutterPx: projectDetailViewportGutterPx');
		expect(featureTable).toContain('refreshKey: rows');
		expect(featureTable).toContain('rootRef={tableRef}');
		expect(featureTable).toContain('scrollerClassName={viewportFillScrollerClass}');
		expect(featureTable).not.toContain('minHeightPx: 0');
		expect(featureTable).toContain('featureSourceDisplayLabel(source)');
		expect(artifacts).toContain('<div className="@container space-y-4">');
		expect(artifacts).not.toContain('contentRailClass');
		expect(artifacts).toContain('@min-[32rem]:grid-cols-4');
		expect(artifacts).not.toContain('@min-[80rem]:grid-cols-2');
	});

	test('keeps repository divergence visible and short-circuits a clean tree', async () => {
		const strip = await detail('ProjectStatusStrip.tsx');
		const tree = await detail('workingTree/WorkingTreeCard.tsx');

		expect(strip).toContain(
			'grid grid-cols-[minmax(0,1.5fr)_minmax(0,0.8fr)_minmax(0,0.8fr)] gap-x-2 border-y border-border py-2 sm:flex sm:flex-wrap sm:gap-x-10 sm:py-3',
		);
		expect(strip).not.toContain('grid-cols-3');
		const cleanAt = tree.indexOf('if (files.length === 0)');
		expect(cleanAt).toBeGreaterThan(-1);
		expect(tree.indexOf('<WorkingTreeToolbar')).toBeGreaterThan(cleanAt);
		expect(tree.slice(cleanAt, tree.indexOf('<WorkingTreeToolbar'))).toContain('<EmptyState');
	});

	test('gives each overview status fact one visual owner and names metadata links', async () => {
		const strip = await detail('ProjectStatusStrip.tsx');
		const summary = await detail('OverviewSummary.tsx');
		const maturity = await detail('MaturityOverview.tsx');
		const metadata = await detail('MetadataRow.tsx');
		const overview = await detail('OverviewTab.tsx');

		for (const label of ['Artifact health', 'Phase', 'Milestone']) {
			expect(strip).not.toContain(`label="${label}"`);
		}
		for (const label of ['Profile', 'Profile source', 'Working tree']) {
			expect(strip).toContain(`label="${label}"`);
		}
		expect(summary).toContain('label="Artifact Health"');
		expect(summary).toContain('label="Lifecycle"');
		expect(maturity).not.toContain('{maturity.percent}% complete');
		expect(metadata).toContain('aria-label={link.ariaLabel}');
		expect(metadata).toContain('max-sm:min-h-11 max-sm:items-center max-sm:py-0');
		for (const label of [
			'Spec updated:',
			'Screens:',
			'Test scenarios:',
			'Interview:',
			'Profile:',
		]) {
			expect(overview).toContain(`ariaLabel: \`${label}`);
		}
	});

	test('puts operational run history before accounting and collapses mobile details', async () => {
		const runs = await detail('RunsTab.tsx');
		const usage = await detail('ProjectUsagePanel.tsx');
		const operationalBranch = runs.slice(runs.lastIndexOf('<TabIntro'));

		expect(operationalBranch.indexOf('<ActiveRunsPanel')).toBeLessThan(
			operationalBranch.indexOf('<LocalAiddHistoryPanel'),
		);
		expect(operationalBranch.indexOf('<LocalAiddHistoryPanel')).toBeLessThan(
			operationalBranch.indexOf('<ProjectUsagePanel'),
		);
		expect(runs).toContain('totalRunCount={usage.totals.runCount}');
		expect(runs).toContain('most recent of ${usage.totals.runCount} finalized Runs');
		expect(usage).toContain('aria-expanded={breakdownOpen}');
		expect(usage).toContain('the latest entry for each Run ID is counted');
		expect(usage).toContain('Usage breakdown · {usage.byExecutionTarget.length} targets');
		expect(usage).toContain("breakdownOpen ? 'block' : 'hidden sm:block'");
		expect(usage).toContain('of input tokens');
	});

	test('aligns run controls, usage columns, result details, and history headings', async () => {
		const table = await shared('local-aidd-history/LocalRunsTable.tsx');
		const tableHeader = await shared('local-aidd-history/LocalRunsTableHeader.tsx');
		const results = await shared('local-aidd-history/LocalRunResultBadges.tsx');
		const history = await shared('LocalAiddHistoryPanel.tsx');
		const usage = await detail('ProjectUsagePanel.tsx');

		expect(table).not.toContain('scrollerClassName={viewportFillScrollerClass}');
		expect(table).not.toContain('rootRef={tableRef}');
		expect(history).toContain('overflow-hidden p-0 ${tableColumnClass}');
		expect(table).toContain('<FieldRow group label="Outcome">');
		expect(table).toContain('size="default"');
		expect(table).toContain('<FilterSelect');
		expect(table).toContain('label="CLI"');
		expect(table).not.toContain('className="sm:ml-auto"');
		expect(tableHeader).toContain('<col className="w-11" />');
		expect(tableHeader).toContain('<col className="w-[26%]" />');
		expect(tableHeader.match(/<SortableColumnHeader/gu)).toHaveLength(3);
		expect(tableHeader).toContain('<col className="w-28" />');
		expect(tableHeader).toContain('<col />');
		const iterationLabel = /runIterations\.length === 1\s*\?\s*'iteration'\s*:\s*'iterations'/u;
		expect(table).toMatch(iterationLabel);
		expect(results).not.toMatch(iterationLabel);
		expect(history).toContain('running.length > 0 || orphans.length > 0 ?');
		expect(usage.match(/<UsageTableColumns \/>/gu)).toHaveLength(2);
		expect(usage).toContain('contentSizedTableClass');
		expect(usage).not.toContain('table-fixed');
	});

	test('keeps long artifact groups in the page scroll flow', async () => {
		const groups = await detail('ArtifactGroups.tsx');

		expect(groups).toContain('grid grid-flow-dense items-start');
		expect(groups).toContain('className="mt-2 flex flex-col gap-2"');
		expect(groups).not.toContain('max-h-[28rem]');
		expect(groups).not.toContain('<OverflowScroller');
		expect(groups).not.toContain('gap-2${');
	});

	test('keeps mobile interview prompts full width without losing their names', async () => {
		const row = await detail('InterviewQuestionRow.tsx');

		expect(row).toContain('flex-col items-start');
		expect(row).toContain('sm:w-24 sm:shrink-0');
		expect(row).toContain('max-sm:[&>p]:line-clamp-3');
		expect(row).toContain('`Answer question: ${questionName}`');
	});

	test('composes interview progress, bounds rows, and exposes a visible focus ring', async () => {
		const tab = await detail('InterviewTab.tsx');
		const row = await detail('InterviewQuestionRow.tsx');

		expect(tab).toContain('<span>{interviewPriorityComposition(allQuestions)}</span>');
		expect(tab).toContain('style={{ width: `${completionPercent}%` }}');
		expect(tab).toContain('role="progressbar"');
		expect(tab).toContain('<InterviewFilters');
		expect(tab).toContain('<div className="@container space-y-4">');
		expect(row).toContain('rounded-md p-2.5 text-left transition-colors');
		expect(row).not.toContain('focus-visible:ring-inset');
		expect(row).not.toContain('focus-visible:border-accent/60');
		expect(row).not.toContain('focus-visible:ring-ring/20');
	});

	test('places live profile feedback before facets and keeps the full audit list later', async () => {
		const profile = await detail('ProfileTab.tsx');
		const summaryAt = profile.indexOf('mode="summary"');
		const facetsAt = profile.indexOf('profileFacets.map');
		const auditsAt = profile.indexOf('mode="audits"');

		expect(profile).toContain('The profile facets that decide');
		expect(summaryAt).toBeGreaterThan(-1);
		expect(summaryAt).toBeLessThan(facetsAt);
		expect(auditsAt).toBeGreaterThan(facetsAt);
	});

	test('compacts milestone/history introductions and shares report empty states', async () => {
		const milestones = await detail('MilestonesTab.tsx');
		const history = await detail('HistoryTab.tsx');
		const reports = await detail('ReportsTab.tsx');

		expect(milestones).toContain('actionLayout="stacked"');
		expect(milestones).toContain('<span className="sm:hidden">Auto-place</span>');
		expect(history).toContain('About history completion times');
		expect(history).toContain('px-4 py-2 sm:py-3');
		expect(reports.match(/label="File report"/gu)).toHaveLength(3);
		expect(reports).toContain('No reports match the current filters.');
	});
});
