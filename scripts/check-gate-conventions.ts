#!/usr/bin/env bun
/**
 * check-gate-conventions.ts
 *
 * The meta-gate. Statically enforces the decidable rules of `docs/reference/gate-conventions.md`
 * across every TypeScript file a gate task runs, so that the conventions are a contract rather
 * than a document nobody reads. A gate task is one named `check*`, or one the allowlist's `gates`
 * map declares with a reason -- see `lib/gate/discover.ts` for why the naming convention alone was
 * not the population.
 *
 * Enforces: ASSERT-050 (spernakit) / QUAL-006 (aidd) -- every gate follows the conventions in
 * docs/reference/gate-conventions.md.
 *
 * Rule 7 (waiver forms) has no static form, and rule 5 (anti-vacuity) has one for half of itself:
 * whether a success line states a count is decidable, whether a run legitimately reached zero items
 * is not. Both remainders are reviewed during the phase-2 migration. Gates that do not conform yet
 * are named in `scripts/gate-conventions-allowlist.json` with a reason; that list can only shrink,
 * because a waiver whose rule has started passing is reported as a finding against the allowlist
 * itself.
 *
 * This file is its own first test case: it satisfies all eight rules, including the two nobody
 * checks, and is the shape every gate is migrating toward.
 *
 * Run: bun run check:gate-conventions [--root <dir>] [--json] [--list-waived]
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { exit } from 'node:process';
import { parseArgs } from 'node:util';

import { applyAllowlist, loadAllowlist } from './lib/gate/allowlist.ts';
import { discoverGates, staleDeclarations } from './lib/gate/discover.ts';
import { ASSERTION_ID, checkGate } from './lib/gate/rules.ts';
import { type Finding, type Gate, RULE_TITLES } from './lib/gate/types.ts';

const ALLOWLIST = 'scripts/gate-conventions-allowlist.json';
const ASSERTIONS = '.aidd/assertions.md';

export interface GateConventionsOptions {
	/** Emit the machine-readable envelope instead of the human report. */
	json?: boolean | undefined;
	/** Also print what the allowlist suppressed, so the remaining debt is visible. */
	listWaived?: boolean | undefined;
	root?: string | undefined;
}

export interface GateConventionsReport {
	/** Gate tasks the allowlist declares, of the population `examined` was drawn from. */
	declared: number;
	examined: number;
	findings: Finding[];
	gate: string;
	status: 'fail' | 'pass';
	waived: Finding[];
}

/**
 * Assertion IDs declared by this repository, or an empty set when the catalog is unreadable.
 *
 * `.aidd/` is gitignored fleet-wide, so this file is absent in a fresh clone and in CI. That is not
 * a failure: without it, rule 6 still requires an `Enforces:` line and only stops verifying that a
 * cited ID resolves.
 */
export function readAssertionIds(root: string): Set<string> {
	const path = join(root, ASSERTIONS);
	if (!existsSync(path)) return new Set();
	const text = readFileSync(path, 'utf8');
	return new Set([...text.matchAll(ASSERTION_ID)].map((match) => match[0]));
}

/** Analyze the repository at `root` and return its report. Pure with respect to stdout. */
export async function collectGateConventions(root: string): Promise<GateConventionsReport> {
	const allowlist = await loadAllowlist(join(root, ALLOWLIST));
	const manifest = readFileSync(join(root, 'package.json'), 'utf8');
	const declared = Object.keys(allowlist.gates);
	const discovered = discoverGates(manifest, declared);
	const allPaths = new Set(discovered.map((entry) => entry.path));
	const assertionIds = readAssertionIds(root);

	const gates: Gate[] = [];
	for (const entry of discovered) {
		if (entry.path in allowlist.excluded) continue;
		const absolute = join(root, entry.path);
		if (!existsSync(absolute)) {
			throw new Error(
				`${entry.path} is run by ${entry.tasks.join(', ')} but does not exist. ` +
					'A task pointing at a missing file is a broken gate, not a convention finding.',
			);
		}
		gates.push({
			path: entry.path,
			source: readFileSync(absolute, 'utf8'),
			tasks: entry.tasks,
		});
	}

	const raw = gates.flatMap((gate) => checkGate(gate, assertionIds));
	const applied = applyAllowlist(
		allowlist,
		gates,
		raw,
		allPaths,
		ALLOWLIST,
		staleDeclarations(manifest, declared),
	);

	return {
		declared: declared.length,
		examined: gates.length,
		findings: applied.surviving,
		gate: 'check:gate-conventions',
		status: applied.surviving.length === 0 ? 'pass' : 'fail',
		waived: applied.suppressed,
	};
}

function order(a: Finding, b: Finding): number {
	return a.path.localeCompare(b.path) || a.rule.localeCompare(b.rule) || a.line - b.line;
}

function describe(item: Finding): string {
	const where = item.line > 0 ? `${item.path}:${item.line}` : item.path;
	return `- ${where} [${item.rule} ${RULE_TITLES[item.rule]}] ${item.message}`;
}

/**
 * Run the gate. Returns the process exit code: 0 pass, 1 findings, 2 unexpected error.
 *
 * Rule 5 is enforced on this gate the way it will be enforced on every gate: a run that examined
 * zero gates fails rather than reporting a vacuous pass, and a run that passed says how many it
 * examined.
 */
export async function runGateConventions(options: GateConventionsOptions = {}): Promise<number> {
	const root = resolve(options.root ?? join(import.meta.dir, '..'));
	let report: GateConventionsReport;
	try {
		report = await collectGateConventions(root);
	} catch (err) {
		console.error(`[FAIL] check:gate-conventions could not run: ${(err as Error).message}`);
		return 2;
	}

	if (options.json === true) {
		console.log(JSON.stringify(report, null, 2));
		return report.status === 'pass' ? 0 : 1;
	}

	if (report.examined === 0) {
		console.error(
			'[FAIL] check:gate-conventions examined no gates. Either package.json has no `check*` task ' +
				'and the allowlist declares none, or the allowlist excludes every file they reach; ' +
				'all of those are defects, not a pass.',
		);
		return 1;
	}

	if (options.listWaived === true && report.waived.length > 0) {
		console.error(`[SKIP] ${report.waived.length} finding(s) waived by ${ALLOWLIST}:`);
		for (const item of [...report.waived].sort(order)) console.error(describe(item));
	}

	if (report.findings.length > 0) {
		console.error('[FAIL] Gate convention violations:');
		for (const item of [...report.findings].sort(order)) console.error(describe(item));
		console.error('\nSee docs/reference/gate-conventions.md for what each rule requires.');
		console.log(
			`[FAIL] check:gate-conventions -- ${report.findings.length} violation(s) across ${report.examined} gates.`,
		);
		return 1;
	}

	console.log(
		`[OK] check:gate-conventions -- ${report.examined} gates examined from \`check*\` plus ` +
			`${report.declared} task(s) declared in ${ALLOWLIST}, no unwaived violations, ` +
			`${report.waived.length} waived.`,
	);
	return 0;
}

if (import.meta.main) {
	// `parseArgs` throws on an unknown flag, and an uncaught throw exits 1 -- the code rule 2
	// reserves for findings. A gate that reports "one violation" when it was actually mistyped is
	// the confusion rule 2 exists to end, so bad arguments are caught and mapped onto 2 here.
	let options: GateConventionsOptions;
	try {
		const { values } = parseArgs({
			args: Bun.argv.slice(2),
			options: {
				json: { type: 'boolean' },
				'list-waived': { type: 'boolean' },
				root: { type: 'string' },
			},
			strict: true,
		});
		options = { json: values.json, listWaived: values['list-waived'], root: values.root };
	} catch (err) {
		console.error(`[FAIL] check:gate-conventions: ${(err as Error).message}`);
		console.error('Usage: check:gate-conventions [--root <dir>] [--json] [--list-waived]');
		exit(2);
	}
	exit(await runGateConventions(options));
}
