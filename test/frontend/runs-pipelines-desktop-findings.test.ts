import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const FRONTEND_SRC = join(import.meta.dir, '..', '..', 'frontend', 'src');

async function source(...segments: string[]): Promise<string> {
	return readFile(join(FRONTEND_SRC, ...segments), 'utf8');
}

describe('runs, pipelines, identity lab, and diary desktop findings', () => {
	test('counts loaded execution entries in the same unit before and after filtering', async () => {
		const state = await source('pages', 'runs', 'useRunsPage.ts');
		const page = await source('pages', 'runs', 'RunsPage.tsx');
		const filters = await source('pages', 'runs', 'RunFilters.tsx');

		expect(state).toContain('const loadedEntries = buildUnifiedEntries(runList, sessionList);');
		expect(state).toContain('filteredEntryCount: filteredEntries.length');
		expect(state).toContain('loadedEntryCount: loadedEntries.length');
		expect(page).toContain('filteredCount={page.filteredEntryCount}');
		expect(page).toContain('displayedCount={page.displayedEntryCount}');
		expect(filters).toContain('readoutLabel="Matching"');
		expect(filters).toContain('${displayedCount} shown');
	});

	test('gives fixed execution columns only their useful floor', async () => {
		const table = await source('pages', 'runs', 'UnifiedExecutionTable.tsx');
		const runRow = await source('pages', 'runs', 'ActiveRunRow.tsx');

		expect(table).toContain('<col className="w-full min-w-[13.75rem]" />');
		expect(table).toContain('<col className={`${contentSizedColumnClass} min-w-52`} />');
		expect(table).toContain('`${contentSizedColumnClass} min-w-24`');
		expect(table).toContain("showLifecycleControls && 'min-w-24'");
		expect(runRow).toContain('flex-nowrap items-center gap-1.5 whitespace-nowrap');
	});

	test('reveals a selected console throughout the stacked Runs tier', async () => {
		const state = await source('pages', 'runs', 'useRunsPage.ts');
		const scroll = state.slice(
			state.indexOf('function scrollConsoleIntoView'),
			state.indexOf('function handleSelectRun'),
		);

		expect(scroll).toContain("scrollIntoView({ behavior: 'smooth', block: 'start' })");
		expect(scroll).not.toContain('matchMedia');
	});

	test('states top-level pipeline progress and visually attaches nested children', async () => {
		const summary = await source('pages', 'pipelineSessions', 'pipelineSessionSummary.ts');
		const rows = await source('pages', 'pipelineSessions', 'StepRows.tsx');

		expect(summary).toContain('`All ${session.totalSteps} steps completed${parkedSuffix}`');
		expect(summary).not.toContain('rows.length');
		expect(rows).toContain("'border-l-2 border-control-border pt-2 pl-2 sm:pt-3 sm:pl-4'");
		expect(rows).toContain(
			"step.depth === 0 ? 'panel' : step.depth === 1 ? 'default' : 'sunken'",
		);
		expect(rows).toContain('stepInsetClass(step.depth)');
		expect(rows).toContain("Child of {parentStepName ?? 'parent step'}");
		expect(rows).toContain("'mt-3 first:mt-0'");
	});

	test('formats a step transcript as events and keeps Raw as an explicit alternate', async () => {
		const consoleSource = await source('pages', 'pipelineSessions', 'StepRunConsole.tsx');
		const body = await source('pages', 'pipelineSessions', 'RunConsoleBody.tsx');
		const log = await source('pages', 'pipelineSessions', 'LogPre.tsx');
		const detail = await source('pages', 'runs', 'runDetailParts.tsx');

		// The console owns the run record; the body it renders parses that backend's transcript.
		expect(consoleSource).toContain('backend={run.data?.backend}');
		expect(body).toContain('parseConsoleEntries(text, backend)');
		expect(body).toContain('<LiveConsolePretty entries={entries} find="" />');
		expect(body).toContain("useState<'pretty' | 'raw'>('pretty')");
		expect(body).toContain('Raw run console output');
		expect(log).toContain('monoEditorMeasureClass');
		expect(log).toContain('microLabelClass');
		expect(detail).toContain('monoEditorMeasureClass');
		expect(detail).toContain('microLabelClass');
	});

	test('makes badge constraints outcomes and exercises production tooltip behavior', async () => {
		const lab = (
			await Promise.all([
				source('pages', 'settings', 'ExecutionIdentityBadgeLabPage.tsx'),
				source('pages', 'settings', 'ExecutionIdentityConstrainedSpecimens.tsx'),
			])
		).join(String.fromCharCode(10));
		const badge = await source('components', 'ui', 'badge.tsx');
		const identity = await source('components', 'shared', 'ExecutionIdentityBadges.tsx');

		expect(lab).toContain("clipped ? 'Clipped' : 'Fits'");
		expect(lab).not.toContain('withTooltip={false}');
		for (const role of ['Healthy', 'Informational', 'Needs attention', 'System-managed']) {
			expect(lab).toContain(`label: '${role}'`);
		}
		expect(badge).toContain("casing = 'preserve'");
		expect(identity).toContain("index > 0 ? 'border-l border-control-border' : ''");
	});

	test('gives the fleet Diary a project column and removes phantom entry dates', async () => {
		const timeline = await source('pages', 'diary', 'DiaryTimelineList.tsx');
		const columns = await source('pages', 'diary', 'diaryTimelineColumns.ts');
		const entry = await source('pages', 'diary', 'DiaryEntryCard.tsx');

		expect(timeline).toContain('grid-cols-(--diary-grid-columns)');
		expect(columns).toContain('project: showProject');
		expect(columns).toContain("...(columns.project ? ['12rem'] : [])");
		expect(timeline).toContain('rowLinkLabel(item, columns.project)');
		expect(timeline).toContain('displayedTitle(item, columns.project)');
		expect(entry).toContain('text-xs text-muted-foreground');
		expect(entry).not.toContain('font-mono');
		expect(entry).not.toContain('entry.date');
		expect(entry).not.toContain('T00:00:00');
	});
});
