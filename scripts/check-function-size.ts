#!/usr/bin/env bun
/**
 * check-function-size.ts
 *
 * Enforces: the function-size ratchet, beside the 300-line file gate (check:max-lines). No
 * assertion ID: the rule is a count that may only fall, not a fixed limit a record could state.
 *
 * WHY A RATCHET. A file-length gate shapes files, not design: a file can sit under 300 lines while
 * its functions run to hundreds of lines and a complexity in the dozens. Making ESLint's complexity
 * and max-lines-per-function rules errors would fail hundreds of functions at once, so a ratchet
 * records how many are over each line today, fails any change that adds to either count, and lets
 * the counts fall. The thresholds are the COMPLICATION audit's (complexity 7, 40 lines excluding
 * blanks and comments); the worst offenders are printed so the next refactor has a target. It
 * counts and does not name functions: adding one oversized function while shrinking another passes.
 *
 * THE MEASUREMENT IS SYNTAX-ONLY. Both rules are core and need no type information, so ESLint
 * runs with --no-config-lookup and the typescript-eslint parser named directly: no repository
 * lint config and no type-aware project service is loaded. The counts depend on the source and
 * the parser, never on eslint.config.js or a tsconfig.
 *
 * The baseline lives in scripts/function-size-baseline.json and is committed; Spernakit carries
 * the same rule with its own counts. When a count falls the gate passes and says so;
 * --update-baseline records the lower number. The gate never raises it. With no baseline the gate
 * fails; --record-baseline writes one from today's counts, once, and refuses when one exists.
 *
 * Run: bun scripts/check-function-size.ts [--update-baseline | --record-baseline]
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { exit } from 'node:process';
import { parseArgs } from 'node:util';

const ROOT = resolve(import.meta.dir, '..');
const BASELINE_PATH = resolve(ROOT, 'scripts/function-size-baseline.json');
const SCANNED = ['cli/src', 'backend/src', 'shared/src', 'frontend/src'];
const WORST_SHOWN = 10;
/** The COMPLICATION audit's thresholds, used when a repository records its first baseline. */
const THRESHOLDS = { complexity: 7, lines: 40 };

interface Baseline {
	complexity: { over: number; threshold: number };
	lines: { over: number; threshold: number };
}

interface Offender {
	file: string;
	line: number;
	measure: number;
	name: string;
}

interface Measured {
	complexity: Offender[];
	files: number;
	lines: Offender[];
}

interface EslintMessage {
	fatal?: boolean;
	line: number;
	message: string;
	ruleId: null | string;
}

/**
 * The ESLint command line: the two size rules alone, parsed syntax-only with the typescript-eslint
 * parser resolved from the installed typescript-eslint package, and no config lookup.
 *
 * @param baseline - The thresholds to measure at.
 * @returns The arguments after `bunx`.
 */
export function eslintArgs(baseline: Baseline): string[] {
	const tsEslint = dirname(Bun.resolveSync('typescript-eslint/package.json', ROOT));
	return [
		'eslint',
		...SCANNED,
		'--no-config-lookup',
		'--ext',
		'.ts,.tsx,.js,.jsx',
		'--parser',
		Bun.resolveSync('@typescript-eslint/parser', tsEslint),
		'--no-inline-config',
		'--rule',
		`complexity:["warn",${baseline.complexity.threshold}]`,
		'--rule',
		`max-lines-per-function:["warn",{"max":${baseline.lines.threshold},"skipBlankLines":true,"skipComments":true}]`,
		'-f',
		'json',
	];
}

/**
 * Runs the syntax-only ESLint pass over the scanned trees and collects every function over either
 * line. The result is independent of the repository's lint configuration and tsconfigs.
 *
 * @param baseline - The thresholds to measure at.
 * @returns The offenders per rule and how many files ESLint scanned.
 */
function measure(baseline: Baseline): Measured {
	const result = spawnSync('bunx', eslintArgs(baseline), {
		cwd: ROOT,
		encoding: 'utf8',
		maxBuffer: 64 * 1024 * 1024,
		shell: true,
		windowsHide: true,
	});
	if (result.error) throw new Error(`eslint could not be run: ${result.error.message}`);
	return parseReport(result.stdout, result.status, result.stderr, ROOT);
}

/**
 * Turns ESLint's JSON report into the offender lists, refusing any report that did not measure
 * every file. A file whose messages include a fatal diagnostic or one with no rule id was not
 * parsed, so its functions were not counted; an empty report or an unparsable one is no
 * measurement at all. Ordinary rule messages with a nonzero exit (ESLint exits 1 on any error
 * severity) are a measurement and are kept.
 *
 * @param stdout - ESLint's JSON output.
 * @param status - ESLint's exit status, null when it was killed.
 * @param stderr - ESLint's stderr, for the refusal message.
 * @param root - The repository root, for relative paths.
 * @returns The offenders per rule and how many files ESLint measured.
 * @throws Error when any file could not be measured or the report is unusable.
 */
export function parseReport(
	stdout: string,
	status: null | number,
	stderr: string,
	root: string,
): Measured {
	let report: { filePath: string; messages: EslintMessage[] }[];
	try {
		report = JSON.parse(stdout || 'null') as typeof report;
	} catch {
		throw new Error(`function-size could not measure: eslint output is not JSON. ${stderr}`);
	}
	if (!Array.isArray(report) || report.length === 0)
		throw new Error(
			`function-size could not measure: eslint returned no report (exit ${status}). ${stderr}`,
		);
	const unmeasured = report
		.filter((file) => file.messages.some((m) => m.fatal || m.ruleId === null))
		.map((file) => file.filePath.slice(root.length + 1).replaceAll('\\', '/'));
	if (unmeasured.length > 0)
		throw new Error(
			`function-size could not measure ${unmeasured.length} file(s) (fatal or rule-less diagnostics): ${unmeasured.slice(0, 5).join(', ')}${unmeasured.length > 5 ? ', ...' : ''}`,
		);
	const complexity: Offender[] = [];
	const lines: Offender[] = [];
	for (const file of report) {
		const path = file.filePath.slice(root.length + 1).replaceAll('\\', '/');
		for (const message of file.messages) {
			const target =
				message.ruleId === 'complexity'
					? complexity
					: message.ruleId === 'max-lines-per-function'
						? lines
						: null;
			if (!target) continue;
			// "Function 'name' has a complexity of 75. Maximum allowed is 7." and
			// "Function 'name' has too many lines (261). Maximum allowed is 40."
			const name = /'([^']+)'/.exec(message.message)?.[1] ?? 'anonymous';
			const number = /(?:complexity of |lines \()(\d+)/.exec(message.message)?.[1];
			target.push({ file: path, line: message.line, measure: Number(number ?? 0), name });
		}
	}
	return { complexity, files: report.length, lines };
}

/**
 * Prints the worst offenders of one rule, largest first.
 *
 * @param label - The rule's name for the heading.
 * @param offenders - The offenders.
 */
function printWorst(label: string, offenders: Offender[]): void {
	const worst = [...offenders].sort((a, b) => b.measure - a.measure).slice(0, WORST_SHOWN);
	console.error(`  worst ${label}:`);
	for (const item of worst)
		console.error(`  - ${item.file}:${item.line} ${item.name} (${item.measure})`);
}

/**
 * The gate. Fails when either count rose above the baseline; passes otherwise, noting when a
 * count fell so the baseline can be lowered.
 *
 * @param updateBaseline - Whether to write lower counts back to the baseline file.
 * @returns The exit code.
 */
export async function runCheckFunctionSize(updateBaseline: boolean): Promise<number> {
	if (!existsSync(BASELINE_PATH)) {
		console.error(
			'[FAIL] function-size has no baseline: scripts/function-size-baseline.json is missing.',
		);
		console.error(
			'  Record this repository\'s own counts once with "bun scripts/check-function-size.ts --record-baseline" and commit the file.',
		);
		return 1;
	}
	const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as Baseline;
	const measured = measure(baseline);
	if (measured.files === 0) {
		console.error(`[FAIL] function-size scanned no files under ${SCANNED.join(', ')}.`);
		return 1;
	}
	const rose: string[] = [];
	const fell: string[] = [];
	const counts = { complexity: measured.complexity.length, lines: measured.lines.length };
	for (const rule of ['complexity', 'lines'] as const) {
		const was = baseline[rule].over;
		const now = counts[rule];
		if (now > was)
			rose.push(
				`${rule}: ${now} functions over ${baseline[rule].threshold}, baseline ${was}`,
			);
		else if (now < was)
			fell.push(
				`${rule}: ${now} functions over ${baseline[rule].threshold}, baseline ${was}`,
			);
	}
	if (rose.length > 0) {
		console.error(`[FAIL] function-size ratchet: ${rose.join('; ')}.`);
		console.error(
			'  A change may not add functions over the line. Split or simplify the new ones.',
		);
		printWorst('complexity', measured.complexity);
		printWorst('length', measured.lines);
		return 1;
	}
	if (fell.length > 0 && updateBaseline) {
		const next: Baseline = {
			complexity: { ...baseline.complexity, over: counts.complexity },
			lines: { ...baseline.lines, over: counts.lines },
		};
		writeFileSync(BASELINE_PATH, `${JSON.stringify(next, null, '\t')}\n`);
		console.log(
			`[OK] function-size baseline lowered: ${fell.join('; ')}. Commit ${BASELINE_PATH}.`,
		);
		return 0;
	}
	if (fell.length > 0)
		console.log(
			`[OK] function-size ratchet holds and a count fell (${fell.join('; ')}); run with --update-baseline to record it.`,
		);
	else
		console.log(
			`[OK] function-size ratchet holds: ${counts.complexity} functions over complexity ${baseline.complexity.threshold} and ${counts.lines} over ${baseline.lines.threshold} lines, across ${measured.files} files; neither count rose.`,
		);
	return 0;
}

/**
 * Writes a repository's first baseline from today's counts, and refuses when one exists: a
 * re-recordable baseline would let the counts rise. The path and the measurement are parameters so
 * the test can exercise both outcomes against a throwaway file; called with the defaults from a
 * test, this would write a real baseline into any repository that has none.
 *
 * @param baselinePath - Where the baseline lives; the repository's own by default.
 * @param measureWith - How the counts are taken; a real ESLint run by default.
 * @returns The exit code.
 */
export function recordBaseline(
	baselinePath: string = BASELINE_PATH,
	measureWith: (baseline: Baseline) => Measured = measure,
): number {
	if (existsSync(baselinePath)) {
		console.error(
			'[FAIL] function-size already has a baseline. It may only be lowered, with --update-baseline.',
		);
		return 1;
	}
	const first: Baseline = {
		complexity: { over: 0, threshold: THRESHOLDS.complexity },
		lines: { over: 0, threshold: THRESHOLDS.lines },
	};
	const measured = measureWith(first);
	first.complexity.over = measured.complexity.length;
	first.lines.over = measured.lines.length;
	writeFileSync(baselinePath, `${JSON.stringify(first, null, '\t')}\n`);
	console.log(
		`[OK] function-size baseline recorded: ${first.complexity.over} functions over complexity ${first.complexity.threshold} and ${first.lines.over} over ${first.lines.threshold} lines, across ${measured.files} files. Commit ${baselinePath}.`,
	);
	return 0;
}

if (import.meta.main) {
	const { values } = parseArgs({
		options: {
			'record-baseline': { default: false, type: 'boolean' },
			'update-baseline': { default: false, type: 'boolean' },
		},
		strict: true,
	});
	exit(
		values['record-baseline']
			? recordBaseline()
			: await runCheckFunctionSize(values['update-baseline']),
	);
}
