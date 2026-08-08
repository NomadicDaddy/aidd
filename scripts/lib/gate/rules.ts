/**
 * The statically decidable rules of `docs/reference/gate-conventions.md`.
 *
 * Each function takes one gate and returns its findings. They are pure over `Gate`, with the single
 * exception of GC6, which is handed the assertion IDs its caller already read, so that every rule
 * stays testable against synthetic sources rather than against the repository it happens to run in.
 */

import { scanTopLevel } from './toplevel.ts';
import { type Finding, type Gate } from './types.ts';
import { inspectVacuity } from './vacuity.ts';

function lineOf(source: string, index: number): number {
	return source.slice(0, index).split('\n').length;
}

function finding(gate: Gate, line: number, rule: Finding['rule'], message: string): Finding {
	return { line, message, path: gate.path, rule };
}

/** GC1 -- entry shape: an exported runner, a main guard, and nothing imperative at module scope. */
export function checkEntryShape(gate: Gate): Finding[] {
	const findings: Finding[] = [];
	const { hasGuard, sideEffects } = scanTopLevel(gate.source);

	const runner = /^export\s+(?:async\s+)?function\s+(run[A-Za-z0-9_]*)\s*\(/m.exec(gate.source);
	const runnerConst = /^export\s+const\s+(run[A-Za-z0-9_]*)\s*[:=]/m.exec(gate.source);
	if (runner === null && runnerConst === null) {
		findings.push(
			finding(
				gate,
				0,
				'GC1',
				'exports no `run*` function, so nothing can invoke the gate except spawning it',
			),
		);
	}
	if (!hasGuard) {
		findings.push(
			finding(
				gate,
				0,
				'GC1',
				'has no `if (import.meta.main)` guard, so importing it runs it',
			),
		);
	}
	for (const effect of sideEffects) {
		findings.push(
			finding(
				gate,
				effect.line,
				'GC1',
				`runs at import time: \`${effect.text.slice(0, 60)}\``,
			),
		);
	}
	return findings;
}

/** GC2 -- exit codes: 0 pass, 1 findings, 2 unexpected error or bad arguments. */
export function checkExitCodes(gate: Gate): Finding[] {
	const findings: Finding[] = [];
	const pattern = /(?:^|[^.\w])(?:process\.)?exit\(\s*(-?\d+)\s*\)/g;
	for (const match of gate.source.matchAll(pattern)) {
		const code = Number(match[1]);
		if (code === 0 || code === 1 || code === 2) continue;
		findings.push(
			finding(
				gate,
				lineOf(gate.source, match.index),
				'GC2',
				`exits ${code}; the sanctioned codes are 0 (pass), 1 (findings), 2 (error or bad arguments)`,
			),
		);
	}
	return findings;
}

/**
 * GC3 -- output: a status marker, and no pictographs anywhere in the file.
 *
 * The pictograph ban is deliberately stricter than the rule text, which bans emoji in output. A
 * gate's source carrying no pictographs at all is trivially satisfiable and removes the question of
 * whether a given literal is reachable by a `console` call, which is not statically answerable.
 * Findings-to-stderr is the half of rule 3 that is not checked here; it is reviewed in phase 2.
 */
export function checkOutput(gate: Gate): Finding[] {
	const findings: Finding[] = [];
	if (!/\[(?:OK|FAIL|WARN|SKIP)\]/.test(gate.source)) {
		findings.push(
			finding(
				gate,
				0,
				'GC3',
				'emits none of the `[OK]` / `[FAIL]` / `[WARN]` / `[SKIP]` status markers',
			),
		);
	}
	gate.source.split('\n').forEach((line, index) => {
		if (/\p{Extended_Pictographic}/u.test(line)) {
			findings.push(
				finding(gate, index + 1, 'GC3', 'carries a pictograph; use a status marker'),
			);
		}
	});
	return findings;
}

/** GC4 -- arguments: `parseArgs({ strict: true })` is the only sanctioned parser. */
export function checkArguments(gate: Gate): Finding[] {
	const findings: Finding[] = [];
	const usesParseArgs = /\bparseArgs\s*\(/.test(gate.source);
	const argv = /(?:process|Bun)\.argv\b/.exec(gate.source);

	if (argv !== null && !usesParseArgs) {
		findings.push(
			finding(
				gate,
				lineOf(gate.source, argv.index),
				'GC4',
				'reads `argv` by hand; use `parseArgs({ strict: true })` from `node:util`',
			),
		);
	}
	if (usesParseArgs && !/\bstrict:\s*true\b/.test(gate.source)) {
		findings.push(
			finding(gate, 0, 'GC4', 'calls `parseArgs` without an explicit `strict: true`'),
		);
	}
	return findings;
}

/**
 * GC5 -- anti-vacuity, the half of it that has a static form.
 *
 * Only the count half is decidable here, and only where the population is discovered rather than
 * fixed. A gate comparing one artifact against one source has no count to state, and demanding one
 * would produce more waivers than findings. See `vacuity.ts` for why each half falls where it does.
 */
export function checkAntiVacuity(gate: Gate): Finding[] {
	const { countlessLine, discovers } = inspectVacuity(gate.source);
	if (!discovers || countlessLine === null) return [];
	return [
		finding(
			gate,
			countlessLine,
			'GC5',
			'discovers the items it examines, but its success line states no count, so a run that ' +
				'found nothing reads exactly like a run that looked at nothing',
		),
	];
}

/** Any assertion ID shape the fleet uses: `ASSERT-001` in spernakit, `SEC-001` and peers in aidd. */
export const ASSERTION_ID = /\b[A-Z]{3,6}-\d{3}\b/g;

/**
 * GC6 -- rule linkage: the gate names the rule it enforces.
 *
 * `assertionIds` is the set harvested from the repository's `.aidd/assertions.md`. That file is a
 * gitignored artifact, so it is absent in a fresh clone and in CI; pass an empty set there and only
 * the `Enforces:` line is required. Verifying a cited ID exists is a bonus where the file is
 * readable, not a precondition for running the gate.
 *
 * The citation check requires that at least ONE cited ID resolves, not that all do. A gate synced
 * between repositories names the ID each repository files it under -- `ASSERT-050` in spernakit,
 * `QUAL-006` in aidd -- and exactly one of those resolves in either place. Requiring all of them
 * would make a shared gate unable to cite anything.
 */
export function checkRuleLinkage(gate: Gate, assertionIds: Set<string>): Finding[] {
	const declaration = /^[\t ]*(?:\*[\t ]*)?Enforces:[\t ]*(.*)$/m.exec(gate.source);
	if (declaration === null) {
		return [
			finding(
				gate,
				0,
				'GC6',
				'has no `Enforces:` line naming the rule it enforces, with its assertion ID where one exists',
			),
		];
	}
	if (assertionIds.size === 0) return [];

	const cited = [...declaration[1]!.matchAll(ASSERTION_ID)].map((match) => match[0]);
	if (cited.length === 0 || cited.some((id) => assertionIds.has(id))) return [];
	return [
		finding(
			gate,
			lineOf(gate.source, declaration.index),
			'GC6',
			`cites ${cited.join(', ')}; none of them is in .aidd/assertions.md`,
		),
	];
}

/** The keys every `--json` gate emits. One shape or none; a second shape is the drift rule 8 bans. */
export const JSON_ENVELOPE_KEYS = ['examined', 'findings', 'gate', 'status'] as const;

/** GC8 -- `--json` is optional, but a gate that offers it emits the one envelope. */
export function checkJson(gate: Gate): Finding[] {
	const offer = /--json\b/.exec(gate.source);
	if (offer === null) return [];
	const missing = JSON_ENVELOPE_KEYS.filter(
		(key) => !new RegExp(`['"]?${key}['"]?\\s*:`).test(gate.source),
	);
	if (missing.length === 0) return [];
	return [
		finding(
			gate,
			lineOf(gate.source, offer.index),
			'GC8',
			`offers --json but its envelope is missing ${missing.join(', ')}`,
		),
	];
}

/** Every static rule, in rule order. */
export function checkGate(gate: Gate, assertionIds: Set<string>): Finding[] {
	return [
		...checkEntryShape(gate),
		...checkExitCodes(gate),
		...checkOutput(gate),
		...checkArguments(gate),
		...checkAntiVacuity(gate),
		...checkRuleLinkage(gate, assertionIds),
		...checkJson(gate),
	];
}
