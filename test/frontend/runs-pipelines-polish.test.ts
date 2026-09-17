import { describe, expect, test } from 'bun:test';

/**
 * `remediation-20260805-polish-runs-pipelines`, spec items 1-8.
 *
 * Each test states the finding it closes, so a later change that reopens one fails against the
 * reason rather than against a class string nobody can place.
 */
const runs = async (file: string): Promise<string> =>
	await Bun.file(`${import.meta.dir}/../../frontend/src/pages/runs/${file}`).text();
const pipeline = async (file: string): Promise<string> =>
	await Bun.file(`${import.meta.dir}/../../frontend/src/pages/pipelineSessions/${file}`).text();

function stripComments(source: string): string {
	return source.replaceAll(/\/\*[\s\S]*?\*\//g, '').replaceAll(/\/\/[^\n]*/g, '');
}

describe('runs and pipelines polish', () => {
	test('leaves the History body in page flow at every width', async () => {
		const table = await runs('UnifiedExecutionTable.tsx');
		const page = await runs('RunsPage.tsx');

		// This originally gave History its own scrollport with a pinned header, capped at the
		// measured viewport remainder. The cap is what made the table shorter as the window grew
		// wider, and on a phone it resolved below the fold and turned History into a keyhole
		// inside a page that then had nothing left to scroll. Both the cap and the nested
		// scrollport that justified the sticky header are gone; the page is the scrollport.
		expect(table).not.toContain('[&>tr>th]:sticky');
		expect(table).not.toContain('var(--fill-height)');
		expect(table).not.toContain('min-h-[20rem]');
		expect(table).not.toContain('bodyScrollClass');
		// The prop that carried it is deleted, not defaulted off: a flag can be flipped back.
		expect(table).not.toContain('scrollBody');
		expect(page).not.toContain('scrollBody');
	});

	test('paginates History inside its Card', async () => {
		const page = await runs('RunsPage.tsx');
		const table = await runs('UnifiedExecutionTable.tsx');
		const pagination = await runs('useRunHistoryPagination.ts');

		expect(page).toContain('footer={');
		expect(page).toContain('<Pagination');
		expect(page).toContain('hasNextPage={page.hasMoreHistory}');
		expect(page).toContain('onLoadNextPage={() => void page.fetchNextHistoryPage()}');
		expect(page).toContain('pageSize={HISTORY_PAGE_SIZE}');
		expect(pagination).toContain('export const HISTORY_PAGE_SIZE = 5;');
		expect(pagination).toContain(
			'clampedHistory.slice(historyStart, historyStart + HISTORY_PAGE_SIZE)',
		);
		expect(table).toContain('{props.footer}');
		expect(table).toContain('filterReset="toolbar"');
		// The control sits inside the Card; the old expanding-list affordance is gone.
		expect(page).not.toContain('<div className="flex justify-center">');
		expect(page).not.toContain('Show more');
	});

	test('makes a failure reason readable and fully recoverable', async () => {
		const reason = await runs('FailureReason.tsx');

		// Two lines is what the STATUS column can give without taking width off the execution
		// identity beside it; the `title` carries the rest. The clamp is on the message rather than
		// the row, because clamping the row would take the glyph with it.
		expect(reason).toContain('line-clamp-2');
		expect(reason).toContain('title={message}');
		for (const file of [
			'PipelineSessionRow.tsx',
			'PipelineStepSubRows.tsx',
			'PipelineStepTableRows.tsx',
		]) {
			const source = await runs(file);
			expect(source).toContain("import { FailureReason } from './FailureReason.tsx';");
			// Every failure reason on these surfaces goes through the component. A hand-rolled
			// paragraph beside it is how the copies drifted apart in the first place, and the tell
			// is a red tone reappearing in a file whose only red was the failure reason.
			expect(source).not.toContain('toneText');
			expect(source).not.toMatch(/red-\d/u);
		}
		// The class the three surfaces would share is absent, not merely unreferenced.
		expect(await runs('runRowUtils.ts')).not.toContain('failureReasonClass');
		// No single-line cap with the full text nowhere.
		expect(await runs('PipelineSessionRow.tsx')).not.toContain('max-w-[16rem] truncate');
	});

	test('says a step failed with something other than the colour red', async () => {
		const reason = await runs('FailureReason.tsx');

		// The glyph is the non-colour carrier: a reader who cannot separate this red from the muted
		// grey beside it was looking at an unlabelled paragraph.
		expect(reason).toContain('icons/triangle-alert');
		expect(reason).toContain('<TriangleAlert aria-hidden="true"');
		// And the glyph being decorative, the word it stands for is spelled out for a screen reader.
		expect(reason).toContain('<span className="sr-only">Failure reason: </span>');
		// The tone is the semantic token, not the palette pair two of the three surfaces inlined.
		// Comments first: this file's own docstring names the literal it stopped using.
		expect(reason).toContain('toneText.red');
		expect(stripComments(reason)).not.toMatch(/red-\d/u);
	});

	test('marks a console search hit in a channel that survives colour blindness', async () => {
		const text = await runs('liveConsoleText.tsx');
		const tones = await Bun.file(`${import.meta.dir}/../../frontend/src/lib/tones.ts`).text();
		const controls = await runs('LiveConsoleControls.tsx');
		const consoleSource = await runs('LiveConsole.tsx');

		// Weight and rule carry the mark; the amber swatch is no longer the only thing that does.
		const markAt = text.indexOf('<mark');
		const markClass = text.slice(markAt, text.indexOf('>', markAt));
		const tokenAt = tones.indexOf('consoleSearchMatchClass');
		const matchToken = tones.slice(tokenAt, tones.indexOf(';', tokenAt));

		expect(markClass).toContain('font-bold');
		expect(markClass).toContain('consoleSearchMatchClass');
		expect(matchToken).toContain('underline');
		// The fixed foreground stays: this scroller is dark in both themes and `text-foreground`
		// would put near-white on amber-300.
		expect(matchToken).toContain('text-neutral-900');
		// Position is discoverable without seeing any highlight at all: the view filters to the
		// matching lines and the toolbar counts them.
		expect(consoleSource).toContain('matchingLines');
		expect(controls).toContain("{matchCount === 1 ? 'match' : 'matches'}");
	});

	test('leads the session report with status without giving one badge a full-width tile', async () => {
		const card = await Bun.file(
			`${import.meta.dir}/../../frontend/src/pages/pipelineSessions/SessionSummaryCard.tsx`,
		).text();
		const statusAt = card.indexOf('label="Status"');
		const startedAt = card.indexOf('label="Started"');
		const gridAt = card.indexOf("'grid gap-3 @min-[32rem]:grid-cols-2");

		// Status remains the first fact in the grid. It is compact when it carries only a badge; a
		// real failure explanation conditionally earns a full row instead of being squeezed into a
		// narrow fact cell.
		expect(statusAt).toBeGreaterThan(-1);
		expect(statusAt).toBeGreaterThan(gridAt);
		expect(statusAt).toBeLessThan(startedAt);
		expect(card.slice(statusAt, card.indexOf('/>', statusAt))).toContain('size="compact"');
		expect(card).toContain('hasFullStatus &&');
		expect(card).toContain('@min-[56rem]:col-span-full');
		// PROJECT restated the PageHeader description one line above it.
		expect(card).not.toContain('label="Project"');
		expect(
			await Bun.file(
				`${import.meta.dir}/../../frontend/src/pages/pipelineSessions/PipelineSessionReportPage.tsx`,
			).text(),
		).toContain('{report.session.projectName}');
	});

	test('uses the accent token for row links, not a raw teal', async () => {
		const links = await runs('ExecutionRowLinks.tsx');

		expect(links).toContain('text-accent');
		expect(links).toContain('focus-visible:ring-accent');
		// The literal, not the word: both files explain in a comment what they stopped using.
		expect(links).not.toMatch(/teal-\d/u);
		// The chips beside the commits chip stopped colouring themselves too.
		const detail = await runs('runDetailParts.tsx');

		expect(detail).not.toMatch(/teal-\d/u);
		expect(detail).not.toMatch(/emerald-\d/u);
	});

	test('renders pipeline steps as real rows of the parent table', async () => {
		const rows = await runs('PipelineStepTableRows.tsx');
		const table = await runs('UnifiedExecutionTable.tsx');

		// Seven `<td>` against the parent's seven `<col>`: the widths are inherited, so there is no
		// second column system to keep in sync with the first.
		expect(rows.match(/<td/gu)?.length).toBeGreaterThanOrEqual(14);
		// Mounted straight into <tbody>, with no colSpan wrapper between it and the rows.
		expect(table).toContain('<PipelineStepTableRows');
		expect(table).not.toContain('colSpan');
		// The private grid that restated the parent colgroup as `fr` units is gone.
		expect(rows).not.toContain('grid-cols-[');
		expect(await runs('PipelineStepSubRows.tsx')).not.toContain('grid-cols-[');
		// Indent lives in the NAME cell, once, for both surfaces.
		expect(rows).toContain('stepIndentPx(step.depth)');
		expect(await runs('PipelineStepSubRows.tsx')).toContain('stepIndentPx(step.depth)');
	});

	test('spells a step type one way across both execution surfaces', async () => {
		const map = await Bun.file(
			`${import.meta.dir}/../../frontend/src/lib/stepTypeLabel.ts`,
		).text();

		expect(map).toContain("'aidd-cli': 'aidd CLI'");
		expect(map).toContain("'recipe-ref': 'Nested recipe'");
		expect(map).toContain('export function stepTypeLabel');
		for (const source of [
			await runs('PipelineStepTableRows.tsx'),
			await runs('PipelineStepSubRows.tsx'),
			await Bun.file(
				`${import.meta.dir}/../../frontend/src/pages/pipelineSessions/StepRows.tsx`,
			).text(),
		]) {
			expect(source).toContain('stepTypeLabel(');
			// `Skill` sat above `skill` in the same column, two rows apart.
			expect(source).not.toContain('>{step.stepType}<');
		}
	});

	test('never describes a finished session in the present progressive', async () => {
		const summary = await runs('PipelineConsoleSummary.tsx');

		expect(summary).toContain('function consoleCaption(');
		expect(summary).toContain('isSessionActive');
		expect(summary).toContain('the last step that started a run');
		// `Streaming …` is now behind the active branch rather than unconditional.
		expect(summary).not.toContain('{`Streaming step');
	});

	test('keeps one row height across Run, Skill and Pipeline kinds', async () => {
		const row = await runs('ActiveRunRow.tsx');

		// One identity line and one meta line, as a session row has: the summary must not add a
		// third and fourth line that only run rows carry.
		expect(row).toContain('<Tooltip content={run.aiSummary}>');
		expect(row).not.toContain('title={run.aiSummary ?? undefined}');
		expect(row).toContain('mt-1 truncate text-xs text-muted-foreground');
	});

	test('reports the rows rendered without reserving an empty filter track', async () => {
		const page = await runs('RunsPage.tsx');
		const mobileLaunch = await runs('MobileRunLaunchDisclosure.tsx');
		const state = await runs('useRunsPage.ts');
		const filters = await runs('RunFilters.tsx');

		expect(await runs('useRunHistoryPagination.ts')).toContain(
			'export const HISTORY_PAGE_SIZE = 5;',
		);
		expect(state).toContain(
			'displayedEntryCount: activeEntries.length + historyPagination.historyEntries.length',
		);
		expect(state).toContain('filteredEntryCount: filteredEntries.length');
		expect(page).toContain('filteredCount={page.filteredEntryCount}');
		expect(page).toContain('displayedCount={page.displayedEntryCount}');
		expect(page.match(/RUNS_SPLIT_COLUMNS_CLASS/gu)?.length).toBe(2);
		expect(page).not.toContain('<div className={RUNS_SPLIT_COLUMNS_CLASS}>');
		expect(mobileLaunch).toContain('aria-expanded={open}');
		expect(mobileLaunch).toContain("!open && 'hidden'");
		expect(filters).not.toContain('rail="full"');
	});

	test('gives stacked History priority and sizes the console only for a selection', async () => {
		const page = await runs('RunsPage.tsx');
		const consoleSource = await runs('LiveConsole.tsx');

		expect(page).toContain("'order-3 min-w-0 self-start");
		expect(page).toContain('order-2 min-w-0 space-y-3');
		expect(page).toContain('page.selection !== undefined &&');
		// The console resolves the page's published `--fill-height` directly. It was `h-full` of a
		// grid the page sized to the same budget, which bound History to it as a side effect.
		expect(page).toContain('@min-[88.375rem]:h-[var(--fill-height)]');
		expect(page).not.toContain('@min-[88.375rem]:h-full');
		expect(consoleSource).toContain('max-h-[min(560px,45vh)]');
		expect(consoleSource).toContain('@min-[88.375rem]:min-h-0');
		expect(consoleSource).toContain('@min-[88.375rem]:flex-1');
	});

	test('packs launch controls around the content they contain', async () => {
		const launch = await runs('RunLaunchCard.tsx');

		expect(launch).toContain("'max-w-[36ch] min-w-44 flex-1'");
		expect(launch).toContain('placeholder="Additional args (e.g. --filter audit-*)"');
		expect(launch).toContain('className="flex flex-wrap items-center gap-3 sm:ml-auto"');
	});

	test('keeps single-step timing at the report level instead of repeating it in the step', async () => {
		const summary = await pipeline('SessionSummaryCard.tsx');
		const page = await pipeline('PipelineSessionReportPage.tsx');
		const rows = await pipeline('StepRows.tsx');

		expect(summary).toContain('const showProgress = stepCount > 1;');
		expect(summary).toContain('role="progressbar"');
		expect(summary).toContain('style={{ width: `${progressPercent}%` }}');
		expect(page).toContain('suppressTiming={singleStep}');
		expect(rows).toContain('suppressTiming ? undefined');
		expect(rows).toContain("title={suppressName ? 'Run detail' : step.stepName}");
		expect(page).toContain('singleStep && row.result.stepName === report.session.recipeName');
	});

	test('uses one step-detail rail and describes completion instead of repeating a fraction', async () => {
		const detail = await pipeline('StepRunDetail.tsx');
		const summary = await pipeline('pipelineSessionSummary.ts');

		expect(detail).not.toContain('contentRailClass');
		expect(detail).toContain('<div className="@container mt-3 space-y-3">');
		expect(detail).toContain('grid-cols-[minmax(0,max-content)_minmax(0,max-content)]');
		expect(detail).not.toContain('@min-[32rem]:grid-cols-3');
		expect(summary).toContain('`Step ${sessionStatusLabel(session.status).toLowerCase()}');
		expect(summary).toContain('`All ${session.totalSteps} steps completed${parkedSuffix}`');
		expect(summary).not.toContain('rows.length');
		expect(summary).not.toContain('`${executed} of ${rows.length} steps');
	});
});
