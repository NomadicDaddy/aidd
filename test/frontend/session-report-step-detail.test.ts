import { describe, expect, test } from 'bun:test';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dir, '../..');

function read(path: string): Promise<string> {
	return Bun.file(join(ROOT, path)).text();
}

const STEP_ROWS = 'frontend/src/pages/pipelineSessions/StepRows.tsx';
const STEP_OUTPUT = 'frontend/src/pages/pipelineSessions/StepOutput.tsx';
const STEP_DETAIL = 'frontend/src/pages/pipelineSessions/StepRunDetail.tsx';
const STEP_CONSOLE = 'frontend/src/pages/pipelineSessions/StepRunConsole.tsx';
const RUN_CONSOLE_BODY = 'frontend/src/pages/pipelineSessions/RunConsoleBody.tsx';
const LOG_PRE = 'frontend/src/pages/pipelineSessions/LogPre.tsx';

/**
 * A page titled "Report" gave ~700 of its 1200 visible pixels to a raw NDJSON slab and said nothing
 * else about the step, while the Live Console showed the same run's result line, execution target,
 * command and file changes. A report strictly worse than the console it summarises is not a report.
 */
describe('a pipeline step card leads with what the step did', () => {
	test('the structured blocks are the console components, not copies of them', async () => {
		const detail = await read(STEP_DETAIL);

		// Imported from the console's own module. Reimplementing them is what lets the two
		// surfaces drift, which is the state this feature is undoing.
		expect(detail).toContain("from '../runs/runDetailParts.tsx'");
		expect(detail).toContain('RunCommandBlock');
		expect(detail).toContain('RunCommitsSection');
		expect(detail).toContain('MetadataItem');
	});

	test('the shared blocks really do come from runDetailParts', async () => {
		const parts = await read('frontend/src/pages/runs/runDetailParts.tsx');
		const panel = await read('frontend/src/pages/runs/RunDetailPanel.tsx');

		expect(parts).toContain('export function RunCommandBlock(');
		expect(parts).toContain('export function RunCommitsSection(');
		// And the Live Console consumes them from there rather than keeping its own originals, so
		// a change to either block reaches both surfaces.
		expect(panel).toContain('<RunCommandBlock command={selectedRun.launchCommand}');
		expect(panel).toContain('<RunCommitsSection run={selectedRun} />');
		expect(panel).not.toContain('function RunCommitsSection');
	});

	test('the raw log is behind the disclosure and is not the card default', async () => {
		const rows = await read(STEP_ROWS);
		const console_ = await read(STEP_CONSOLE);

		// The step card no longer renders the transcript itself; it hands the summary to the
		// Console disclosure, which owns every log surface for the step.
		expect(rows).not.toContain('<StepOutput');
		expect(rows).toContain('<StepRunConsole');
		expect(rows).toContain('outputSummary={step.outputSummary}');
		expect(console_).toContain('<StepOutput output={outputSummary} />');
		// Closed unless the step is live — a running step still streams without a click. The
		// rule itself is initialDisclosure, proved both ways in step-run-console-disclosure.test.ts.
		expect(console_).toContain('useState(() => initialDisclosure(stepStatus))');
	});

	test('the structured detail is ordered above the transcript', async () => {
		const rows = await read(STEP_ROWS);

		expect(rows.indexOf('<StepRunDetail')).toBeGreaterThan(-1);
		expect(rows.indexOf('<StepRunDetail')).toBeLessThan(rows.indexOf('<StepRunConsole'));
	});

	test('expanding releases the cap rather than only flipping the label', async () => {
		const output = await read(STEP_OUTPUT);
		const logPre = await read(LOG_PRE);

		// The region was pinned at max-h-[520px] in both states while its content went 648px to
		// 1311px, so "Show full output" scrolled a little further inside the same box.
		expect(logPre).toContain('max-h-[520px]');
		expect(output).toContain("className={expanded ? 'max-h-none' : ''}");
	});

	test('the preview says it is a tail, and the tail length matches the backend', async () => {
		const output = await read(STEP_OUTPUT);
		const helpers = await read('backend/src/services/pipeline/helpers.ts');

		// `formatOutputSummary` keeps the LAST N characters, so the cut lands mid-token and the
		// slab opens inside a JSON string. If the backend ever changes N, this fails rather than
		// the UI quietly claiming the wrong number.
		const backendMax = /OUTPUT_SUMMARY_MAX_CHARS = (\d+)/.exec(helpers)?.[1];
		const frontendTail = /STEP_OUTPUT_TAIL_CHARS = (\d+)/.exec(output)?.[1];
		expect(backendMax).toBeDefined();
		expect(frontendTail).toBe(backendMax!);
		expect(helpers).toContain('output.slice(output.length - OUTPUT_SUMMARY_MAX_CHARS)');
		// Said in words above the slab, and marked at the cut itself.
		expect(output).toContain('characters of the run output');
		expect(output).toContain("{isTail ? '…\\n' : ''}");
	});

	test('every log surface carries a caption in the house field-label style', async () => {
		const logPre = await read(LOG_PRE);
		const output = await read(STEP_OUTPUT);
		const console_ = await read(RUN_CONSOLE_BODY);

		// Required, not optional: two identical monospace slabs in one card are indistinguishable
		// without one, and the caption doubles as the accessible name so they cannot drift.
		expect(logPre).toContain('caption: string;');
		expect(logPre).not.toContain('caption?:');
		expect(logPre).toContain('aria-label={caption}');
		expect(logPre).toContain("cn(microLabelClass, 'text-muted-foreground')");
		expect(output).toContain('caption="Step output"');
		expect(console_).toContain('aria-label="Run console events"');
		expect(console_).toContain('caption="Raw run console output"');
	});
});
