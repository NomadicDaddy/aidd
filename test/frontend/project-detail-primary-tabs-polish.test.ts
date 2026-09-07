import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const DETAIL_ROOT = resolve(import.meta.dir, '../../frontend/src/pages/projects/detail');
const SHARED_ROOT = resolve(import.meta.dir, '../../frontend/src/components/shared');

const detail = (file: string) => readFile(resolve(DETAIL_ROOT, file), 'utf8');
const shared = (file: string) => readFile(resolve(SHARED_ROOT, file), 'utf8');
// The activity derivation these tabs render moved to aidd-shared when the Dashboard began reading
// the same timeline; only the formatting stayed on this page.
const ACTIVITY_MODULE = resolve(import.meta.dir, '../../shared/src/runs/activity.ts');

describe('project detail primary tab polish', () => {
	test('keeps overview pairs aligned while letting short cards end naturally', async () => {
		const overview = await detail('OverviewTab.tsx');
		const activity = await detail('RecentActivity.tsx');
		const maturity = await detail('MaturityOverview.tsx');

		expect(overview).toContain('grid items-start gap-4 lg:grid-cols-2');
		expect(activity).toContain('divide-y divide-border');
		expect(maturity).toContain('`min-w-0 space-y-2 max-xl:w-full xl:flex-1 ${isComplete');
		expect(maturity).not.toContain('contentRailClass');
	});

	test('makes overview health and activity answer their labels once', async () => {
		const status = await detail('ProjectStatusStrip.tsx');
		const summary = await detail('OverviewSummary.tsx');
		const overview = await detail('OverviewTab.tsx');
		const activity = await detail('RecentActivity.tsx');
		const items = await readFile(ACTIVITY_MODULE, 'utf8');

		expect(status).toContain('<dl');
		expect(status).not.toContain('<Card');
		expect(summary).toContain('tone={artifactTone[project.artifactHealth]}');
		expect(summary).toContain('value={humanizeEnum(project.artifactHealth)}');
		expect(overview).not.toContain('title="aidd activity"');
		expect(activity).toContain('label="aidd state"');
		expect(activity).toContain('label="Last-used target"');
		expect(activity).toContain('flex flex-wrap items-center justify-end gap-2');
		expect(activity).toContain('line-clamp-2');
		expect(items).toContain('summary: runWorkSummary(run)');
		expect(items).toContain('summary: iterationWorkSummary(iteration)');
	});

	test('gives features internal rhythm and content-sized desktop tracks', async () => {
		const tab = await detail('FeaturesTab.tsx');
		const header = await detail('FeaturesTableHeader.tsx');
		const widths = await detail('featureTableWidths.ts');

		expect(tab).toContain('<div className="space-y-4">');
		expect(tab).toContain('phoneInset={false}');
		expect(header).toContain('<col className="w-auto" />');
		expect(header).toContain('<col className="w-[10rem]" />');
		expect(widths).toContain(
			"return { column: 'w-36', table: 'min-w-[60rem] @min-[88rem]:min-w-[77rem]' }",
		);
	});

	test('gives milestone rows a keyboard path and separates hover from destructive actions', async () => {
		const tab = await detail('MilestonesTab.tsx');
		const milestones = await detail('MilestonesTable.tsx');
		const gate = await detail('MilestonesGateCallout.tsx');

		expect(milestones).toContain('hover:bg-muted/40');
		expect(milestones).toContain("showDot={state.label === 'current'}");
		expect(milestones).toContain('role="progressbar"');
		expect(milestones).toContain('<ChevronRight');
		expect(milestones).toContain('max-sm:flex-col max-sm:items-stretch');
		expect(milestones).toContain('<Link');
		expect(milestones).toContain('touchTargetTextClass');
		expect(milestones).toContain('import { milestoneStatePresentation }');
		expect(milestones.match(/<MilestoneStateBadge/gu)).toHaveLength(2);
		expect(milestones).toContain('className="w-full text-left text-sm"');
		expect(milestones).not.toContain('variant="ghost"');
		expect(tab).toContain('title="Roadmap order"');
		expect(tab).toContain('maxWidth="sm"');
		expect(tab).toContain('content={AUTO_PLACE_HELP}');
		expect(tab).toContain('disclosureLabel="Explain auto-place features"');
		expect(tab).toContain('grid w-full grid-cols-2 gap-2');
		expect(tab).not.toContain('title="Repair placement:');
		expect(gate).toContain('maxWidth="sm"');
	});

	test('counts run categories and avoids restating execution metadata', async () => {
		const activeRuns = await detail('ActiveRunsPanel.tsx');
		const localRuns = await shared('local-aidd-history/LocalRunsTable.tsx');
		const usageColumns = await detail('UsageTableColumns.tsx');

		expect(localRuns).toContain('categoryCounts');
		expect(localRuns).toContain('count: categoryCounts.get(category) ?? 0');
		expect(localRuns).toContain('<FilterToolbar');
		expect(localRuns).toContain('onReset={resetFilters}');
		expect(localRuns).not.toContain('Showing {visibleRuns.length} of {runs.length} runs');
		expect(activeRuns).toContain('{runs.length} active');
		expect(activeRuns).toContain('title="Active runs"');
		expect(activeRuns).toContain('classifyRunRecord(run)');
		expect(activeRuns.match(/<RunStatusBadge run=\{run\} \/>/gu)).toHaveLength(2);
		expect(activeRuns).toContain('{humanizeEnum(run.mode)}');
		expect(activeRuns).not.toContain('runRuntimeDetail');
		expect(usageColumns).toContain('className={contentSizedColumnClass}');
		expect(usageColumns).not.toContain('w-[42%]');
	});

	test('renders interview prompts and profile output through their semantic compositions', async () => {
		const interview = await detail('InterviewTab.tsx');
		const filters = await detail('InterviewFilters.tsx');
		const question = await detail('InterviewQuestionRow.tsx');
		const profile = await detail('ProfileTab.tsx');
		const computed = await detail('profile/ComputedProfilePanel.tsx');

		expect(interview).toContain('aria-valuenow={interview.answered}');
		expect(interview).toContain('style={{ width: `${completionPercent}%` }}');
		expect(interview).toContain('className="p-0"');
		expect(interview).not.toContain('tableMeasureClass');
		expect(interview).toContain('<MarkdownContent');
		expect(filters).toContain('headingLevel={3}');
		expect(question.match(/<MarkdownContent/gu)).toHaveLength(2);
		expect(profile).toContain('columns-1 gap-4 @min-[40rem]/editor:columns-2');
		expect(profile).toContain('break-inside-avoid');
		expect(computed).toContain('<Metric');
		expect(computed).toContain('value={posture.label}');
		expect(computed.match(/\{auditMovement\}/gu)).toHaveLength(1);
		expect(computed).toContain('lg:top-[var(--app-topbar-height,0px)]');
		expect(computed).not.toContain('lg:self-start');
	});

	test('keeps code paths unambiguous in search results and the viewer gutter', async () => {
		const results = await detail('CodeFileSearchResults.tsx');
		const tree = await detail('CodeFileTree.tsx');
		const viewer = await detail('CodeFileViewer.tsx');

		expect(tree).toContain('<CodeFileSearchResults');
		expect(results).toContain('const parent =');
		expect(results).toContain('<mark');
		expect(results).toContain('aria-selected={selected}');
		expect(viewer).toContain('sticky left-0 z-10');
		expect(viewer).toContain('border-r border-border bg-card');
		expect(viewer).toContain('path={fileName}');
		expect(viewer).toContain('title={data.path}');
		expect(viewer).toContain('path={data.path}');
	});

	test('measures dependency height and keeps zoom controls with the graph', async () => {
		const filters = await detail('DependencyGraphFilters.tsx');
		const panels = await detail('dependencyGraphPanels.tsx');
		const tab = await detail('DependencyGraphTab.tsx');

		expect(filters).not.toContain('<GraphZoomControls');
		expect(panels).toContain('<GraphSourceLegend');
		expect(panels).toContain('{controls}');
		expect(panels).toContain('useViewportFill<HTMLDivElement>');
		expect(panels).toContain('surface="muted"');
		expect(tab).toContain('<DependencyGraphZoomControls');
		expect(panels).toContain('<DependencyGraphViewportControls');
		expect(tab).toContain('graphViewport.width');
		expect(tab).toContain('const viewportFit =');
		expect(tab).toContain('zoom={renderedZoom}');
	});
});
