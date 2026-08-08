#!/usr/bin/env bun
/**
 * Regression test for the gate-conventions meta-gate.
 *
 * The fixture drives the real package command against an isolated project holding two scratch
 * gates: one that satisfies every statically decidable rule and one that violates all six. Proving
 * the second one fails is the point. A meta-gate that is green because it finds nothing is
 * indistinguishable from a meta-gate that is green because it looks at nothing, and this repository
 * has shipped that defect before -- which is the argument `check-artifact-parity.ts` makes in aidd
 * and the reason rule 5 exists.
 *
 * The allowlist cases matter just as much. The allowlist is what lets the gate be adopted at all,
 * so its two failure modes -- suppressing a violation it should not, and holding an entry that no
 * longer describes anything -- both have a case here.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { exit } from 'node:process';

import { CONFORMING, discovering, VIOLATING } from './lib/gate/fixtures.ts';

interface RunResult {
	exitCode: number;
	output: string;
	stdout: string;
}

let checks = 0;

function assert(condition: boolean, message: string): void {
	if (!condition) throw new Error(message);
	checks++;
}

const repoRoot = join(import.meta.dir, '..');
const fixtureParent = join(repoRoot, 'tmp');
mkdirSync(fixtureParent, { recursive: true });
const fixtureRoot = mkdtempSync(join(fixtureParent, 'gate-conventions-'));

function write(relativePath: string, content: string): void {
	const target = join(fixtureRoot, relativePath);
	mkdirSync(dirname(target), { recursive: true });
	writeFileSync(target, content, 'utf8');
}

function runCheck(...extra: string[]): RunResult {
	const result = Bun.spawnSync(
		['bun', 'run', 'check:gate-conventions', '--', '--root', fixtureRoot, ...extra],
		{ cwd: repoRoot, stderr: 'pipe', stdout: 'pipe' },
	);
	const stdout = result.stdout.toString();
	return { exitCode: result.exitCode, output: `${stdout}${result.stderr.toString()}`, stdout };
}

function writeManifest(scripts: Record<string, string>): void {
	write('package.json', `${JSON.stringify({ name: 'fixture', scripts }, null, '\t')}\n`);
}

function writeAllowlist(value: unknown): void {
	write('scripts/gate-conventions-allowlist.json', `${JSON.stringify(value, null, '\t')}\n`);
}

const ALL_RULES = ['GC1', 'GC2', 'GC3', 'GC4', 'GC6', 'GC8'] as const;

try {
	// --- A conforming gate alone passes, and says how many it examined (rule 5). ---------------
	write('scripts/check-conforming.ts', CONFORMING);
	writeManifest({ 'check:conforming': 'bun scripts/check-conforming.ts' });
	let result = runCheck();
	assert(result.exitCode === 0, `A conforming gate must pass:\n${result.output}`);
	assert(
		result.output.includes('[OK] check:gate-conventions') && result.output.includes('1 gates'),
		`A passing run must report the count it examined:\n${result.output}`,
	);

	// --- The non-conforming gate fails, naming every rule it breaks. --------------------------
	write('scripts/check-violating.ts', VIOLATING);
	writeManifest({
		'check:conforming': 'bun scripts/check-conforming.ts',
		'check:violating': 'bun scripts/check-violating.ts',
	});
	result = runCheck();
	assert(result.exitCode === 1, `A non-conforming gate must fail:\n${result.output}`);
	for (const rule of ALL_RULES) {
		assert(
			result.output.includes(`scripts/check-violating.ts`) &&
				result.output.includes(`[${rule} `),
			`The non-conforming gate must be reported against ${rule}:\n${result.output}`,
		);
	}
	assert(
		!result.output.includes('scripts/check-conforming.ts'),
		`The conforming gate must not be reported:\n${result.output}`,
	);

	// --- Findings go to stderr; the one-line summary goes to stdout (rule 3). ------------------
	assert(
		!result.stdout.includes('[GC1 ') && result.stdout.includes('[FAIL] check:gate-conventions'),
		`Findings belong on stderr and the summary on stdout:\n${result.output}`,
	);

	// --- The --json envelope carries the four keys rule 8 fixes. ------------------------------
	const envelope = JSON.parse(runCheck('--json').stdout) as Record<string, unknown>;
	assert(
		envelope.gate === 'check:gate-conventions' &&
			envelope.status === 'fail' &&
			envelope.examined === 2 &&
			Array.isArray(envelope.findings),
		`--json must emit the single envelope:\n${JSON.stringify(envelope)}`,
	);

	// --- An allowlist entry suppresses exactly what it names. ---------------------------------
	writeAllowlist({
		excluded: {},
		waivers: Object.fromEntries(
			ALL_RULES.map((rule) => [
				rule,
				{ paths: ['scripts/check-violating.ts'], reason: 'fixture' },
			]),
		),
	});
	result = runCheck();
	assert(result.exitCode === 0, `A fully waived gate must pass:\n${result.output}`);

	// --- A waiver whose rule has started passing is a finding: the list can only shrink. -------
	writeAllowlist({
		excluded: {},
		waivers: Object.fromEntries(
			ALL_RULES.map((rule) => [
				rule,
				{
					paths:
						rule === 'GC2'
							? ['scripts/check-conforming.ts', 'scripts/check-violating.ts']
							: ['scripts/check-violating.ts'],
					reason: 'fixture',
				},
			]),
		),
	});
	result = runCheck();
	assert(
		result.exitCode === 1 && result.output.includes('now passes GC2'),
		`A stale waiver must be reported:\n${result.output}`,
	);

	// --- So is an exclusion for a path no check task reaches. ----------------------------------
	writeAllowlist({
		excluded: { 'scripts/nothing-runs-this.ts': 'fixture' },
		waivers: Object.fromEntries(
			ALL_RULES.map((rule) => [
				rule,
				{ paths: ['scripts/check-violating.ts'], reason: 'fixture' },
			]),
		),
	});
	result = runCheck();
	assert(
		result.exitCode === 1 && result.output.includes('no `check*` task reaches'),
		`A stale exclusion must be reported:\n${result.output}`,
	);

	// --- A waiver with no reason is a parse error, not a silent pass (rule 7). -----------------
	writeAllowlist({ excluded: {}, waivers: { GC1: { paths: ['scripts/check-violating.ts'] } } });
	result = runCheck();
	assert(
		result.exitCode === 2 && result.output.includes('has no reason'),
		`A reasonless waiver must be an error:\n${result.output}`,
	);

	// --- An exclusion removes a path from the population entirely. -----------------------------
	writeAllowlist({ excluded: { 'scripts/check-violating.ts': 'fixture' }, waivers: {} });
	result = runCheck();
	assert(
		result.exitCode === 0 && result.output.includes('1 gates'),
		`An excluded path must leave the population:\n${result.output}`,
	);

	// --- GC5: a discovering gate must say how many items it examined. -------------------------
	// The three cases are the three ways the check has been wrong. `vacuous` is the finding
	// itself. `counting` wraps its success line across two concatenated fragments with the count
	// in the second, which is how most of them are written under the 100-column limit and which
	// an unmerged reading calls countless. `quoted` puts an apostrophe in an earlier argument,
	// which used to make the scan pair that quote with the next one, swallow the real backtick
	// success line, and report a line number from the middle of unrelated code.
	writeAllowlist({ excluded: {}, waivers: {} });
	write('scripts/check-vacuous.ts', discovering('Vacuous', ["console.log('[OK] vacuous.');"]));
	write(
		'scripts/check-counting.ts',
		discovering('Counting', [
			'console.log(',
			'\t`[OK] counting -- ${files.length} file(s) examined, ` +',
			"\t\t'nothing out of place.',",
			');',
		]),
	);
	write(
		'scripts/check-quoted.ts',
		discovering('Quoted', [
			"console.log('   reading the project\\'s scripts directory...');",
			'console.log(`[OK] quoted -- ${files.length} file(s) examined.`);',
		]),
	);
	writeManifest({
		'check:counting': 'bun scripts/check-counting.ts',
		'check:quoted': 'bun scripts/check-quoted.ts',
		'check:vacuous': 'bun scripts/check-vacuous.ts',
	});
	result = runCheck();
	assert(
		result.exitCode === 1 && /check-vacuous\.ts:\d+ \[GC5 /.test(result.output),
		`A discovering gate with no count must be reported against GC5:\n${result.output}`,
	);
	assert(
		!result.output.includes('check-counting.ts') && !result.output.includes('check-quoted.ts'),
		`A success line that states its count must not be reported:\n${result.output}`,
	);

	// --- A gate over a fixed population has no count to state, so GC5 does not reach it. -------
	writeManifest({ 'check:conforming': 'bun scripts/check-conforming.ts' });
	result = runCheck();
	assert(
		result.exitCode === 0,
		`A gate whose population is fixed in source must stay exempt:\n${result.output}`,
	);

	// --- Anti-vacuity: examining nothing is a failure, not a pass (rule 5). --------------------
	rmSync(join(fixtureRoot, 'scripts', 'gate-conventions-allowlist.json'));
	writeManifest({ build: 'bun run nothing' });
	result = runCheck();
	assert(
		result.exitCode === 1 && result.output.includes('examined no gates'),
		`A run that examined nothing must fail:\n${result.output}`,
	);

	// --- A task pointing at a file that does not exist is an error, not a convention finding. --
	writeManifest({ 'check:ghost': 'bun scripts/check-ghost.ts' });
	result = runCheck();
	assert(
		result.exitCode === 2 && result.output.includes('does not exist'),
		`A task pointing at a missing file must exit 2:\n${result.output}`,
	);

	// --- Unknown arguments exit 2 rather than being ignored (rules 2 and 4). -------------------
	writeManifest({ 'check:conforming': 'bun scripts/check-conforming.ts' });
	result = runCheck('--nonsense');
	assert(result.exitCode === 2, `An unknown flag must exit 2:\n${result.output}`);

	console.log(`[OK] Gate conventions test passed (${checks} assertions).`);
} catch (err: unknown) {
	console.error(`[FAIL] ${err instanceof Error ? err.message : String(err)}`);
	exit(1);
} finally {
	rmSync(fixtureRoot, { force: true, recursive: true });
}
