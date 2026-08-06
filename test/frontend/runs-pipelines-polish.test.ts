import { describe, expect, test } from 'bun:test';

/**
 * `remediation-20260805-polish-runs-pipelines`, spec items 1-8.
 *
 * Each test states the finding it closes, so a later change that reopens one fails against the
 * reason rather than against a class string nobody can place.
 */
const runs = async (file: string): Promise<string> =>
	await Bun.file(`${import.meta.dir}/../../frontend/src/pages/runs/${file}`).text();

describe('runs and pipelines polish', () => {
	test('caps the History body in its own scrollport with a pinned header', async () => {
		const table = await runs('UnifiedExecutionTable.tsx');
		const page = await runs('RunsPage.tsx');

		// A per-`th` sticky, not a sticky `thead`: a sticky thead leaves the cells transparent and
		// the rows scroll visibly through the column names.
		expect(table).toContain('[&>tr>th]:sticky');
		expect(table).toContain('[&>tr>th]:bg-muted');
		expect(table).toContain('max-h-[calc(100dvh-22rem)] min-h-[20rem]');
		expect(table).toContain('scrollerClassName={bodyScrollClass}');
		// History is the unbounded one; Active is short by construction and stays in page flow.
		expect(page).toContain('scrollBody');
		expect(page.indexOf('scrollBody')).toBeGreaterThan(page.indexOf('title="Active"'));
	});

	test("puts 'Show more' inside the Card it grows", async () => {
		const page = await runs('RunsPage.tsx');
		const table = await runs('UnifiedExecutionTable.tsx');

		expect(page).toContain('footer={');
		expect(table).toContain('{props.footer ? (');
		expect(table).toContain('border-t border-border');
		// The control used to sit on the page background under the Card; nothing renders it there.
		expect(page).not.toContain('<div className="flex justify-center">');
	});

	test('makes a failure reason readable and fully recoverable', async () => {
		const utils = await runs('runRowUtils.ts');

		// Two lines is what the STATUS column can give without taking width off the execution
		// identity beside it; the `title` carries the rest.
		expect(utils).toContain("export const failureReasonClass = 'mt-1 line-clamp-2 text-xs'");
		for (const file of [
			'PipelineSessionRow.tsx',
			'PipelineStepSubRows.tsx',
			'PipelineStepTableRows.tsx',
		]) {
			const source = await runs(file);
			expect(source).toContain('failureReasonClass');
			expect(source).toContain('title={');
		}
		// The old single-line cap with the full text nowhere.
		expect(await runs('PipelineSessionRow.tsx')).not.toContain('max-w-[16rem] truncate');
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

		// One identity line and one meta line, as a session row has: the summary used to add a
		// third and fourth line that only run rows carried.
		expect(row).toContain('title={run.aiSummary ?? undefined}');
		expect(row).toContain('mt-1 truncate text-xs text-muted-foreground');
	});
});
