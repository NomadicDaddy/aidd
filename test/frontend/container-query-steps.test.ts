import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SRC = resolve(import.meta.dir, '../../frontend/src');

function source(relative: string): string {
	return readFileSync(join(SRC, relative), 'utf8');
}

function stripComments(text: string): string {
	return text.replaceAll(/\/\*[\s\S]*?\*\//g, '').replaceAll(/\/\/[^\n]*/g, '');
}

/**
 * Container-query steps whose container was measured on a phone rather than assumed from the
 * viewport. A `@container` step resolves against the nearest containment ancestor, so the same
 * token means a different width at every nesting depth, and a step above the width its container
 * actually reaches selects a branch nobody designed.
 *
 * `at390` and `at360` are the container's measured width inside a 390x844 and a 360x800 viewport.
 * `fires` says which of the two the step selects the wide branch at. A site is only allowed to be
 * `neither` when the narrow branch is the intended phone layout and the file says why; `both` is
 * for the sites where the wide branch was wanted on a phone and the step was in the way.
 *
 * A step landing between the two measurements is the defect this file exists to prevent: 390 and
 * 360 are the same class of device, and a layout that changes between them changes for no reason
 * the reader can see.
 */
const MEASURED: readonly {
	at360: number;
	at390: number;
	file: string;
	fires: 'both' | 'neither';
	/** The utility carrying the step, asserted present so the step cannot be deleted instead of placed. */
	step: string;
	why: string;
}[] = [
	{
		at360: 328,
		at390: 358,
		file: 'pages/about/AboutPage.tsx',
		fires: 'neither',
		step: '@min-[28rem]:grid-cols-[5rem_minmax(0,1fr)]',
		why: 'raised out of the phone range: the grid leaves 262px beside the 80px mark for product identity',
	},
	{
		at360: 328,
		at390: 358,
		file: 'pages/dashboard/DashboardMetrics.tsx',
		fires: 'both',
		step: '@min-[20rem]:grid-cols-2',
		why: 'two compact readings a row are wanted at both widths; 158px a column at 328px',
	},
	{
		at360: 294,
		at390: 324,
		file: 'pages/projects/ProjectCardMetrics.tsx',
		fires: 'neither',
		step: '@min-[22rem]:grid-cols-2',
		why: 'one column is the designed branch; a second would leave ~140px for values that already wrapped to four lines',
	},
	{
		at360: 290,
		at390: 320,
		file: 'pages/projects/detail/profile/ComputedProfilePanel.tsx',
		fires: 'neither',
		step: '@min-[40rem]/audits:grid-cols-2',
		why: 'two 145px columns would truncate an audit name away from the chip that qualifies it',
	},
	{
		at360: 306,
		at390: 336,
		file: 'components/shared/EditorActionBar.tsx',
		fires: 'neither',
		step: '@min-[32rem]:flex-row',
		why: 'the stacked branch keeps a wrapping block-reason message above its buttons rather than opposite them',
	},
	{
		at360: 260,
		at390: 290,
		file: 'pages/pipelineSessions/SessionSummaryCard.tsx',
		fires: 'neither',
		step: '@min-[32rem]:grid-cols-2',
		why: 'the values are exit codes, modes and skill invocations, wider than half of a 290px card',
	},
	{
		at360: 328,
		at390: 358,
		file: 'pages/telemetry/TelemetrySummary.tsx',
		fires: 'both',
		step: '@min-[20rem]:grid-cols-2',
		why: 'the three headline figures read the same way on either handset',
	},
];

/** rem steps resolve against the root font size, which this app leaves at the 16px default. */
const REM = 16;

function stepPx(step: string): number {
	const rem = /@min-\[(\d+(?:\.\d+)?)rem\]/u.exec(step);
	if (rem === null) throw new Error(`no rem step in ${step}`);
	return Number(rem[1]) * REM;
}

describe('container-query steps are placed against a measured container, not an assumed viewport', () => {
	test('no step falls between the two phone measurements of its own container', () => {
		for (const site of MEASURED) {
			const px = stepPx(site.step);
			const straddles = px > site.at360 && px <= site.at390;

			// The whole failure mode in one assertion. A step inside this band selects the wide
			// branch on one common handset width and the narrow branch on the other, so the phone
			// layout is decided by 30px of viewport nobody chose.
			expect({ file: site.file, straddles }).toEqual({ file: site.file, straddles: false });
		}
	});

	test('each site fires exactly where it is recorded as firing', () => {
		for (const site of MEASURED) {
			const px = stepPx(site.step);
			const fires = px <= site.at360 && px <= site.at390 ? 'both' : 'neither';
			expect({ file: site.file, fires }).toEqual({ file: site.file, fires: site.fires });
		}
	});

	test('every measured site still carries its step', () => {
		// Placing a step and deleting it produce the same screenshot at one viewport and different
		// ones everywhere else, so the step itself is what this asserts — not its absence narrow.
		for (const site of MEASURED) {
			expect(stripComments(source(site.file))).toContain(site.step);
		}
	});

	test('every measured site records the width it was measured against', () => {
		// Criterion 3: a step inside a nested card is not measuring the viewport, and the next
		// author must not have to rediscover that. The figure lives in a comment beside the step.
		for (const site of MEASURED) {
			const comments = (source(site.file).match(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/gu) ?? []).join(
				'\n',
			);
			expect({ file: site.file, has: comments.includes(`${site.at390}px`) }).toEqual({
				file: site.file,
				has: true,
			});
		}
	});
});
