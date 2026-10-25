#!/usr/bin/env bun
/**
 * check-artifact-parity.ts
 *
 * Enforces: DATA-001 and DATA-005 -- docs/reference/artifacts.md is the complete catalog of
 * every `.aidd/` path aidd recognizes, and scaffolding/.gitignore never lets any of it be committed
 * (Phillip #21448: .aidd/ is untracked in every repository).
 *
 * Failures caught:
 *   1. no wholesale rule — the scaffold must ignore `/.aidd/` itself.
 *   2. a repeated wholesale rule, or any per-path `.aidd/...` rule beside it. Either is redundant,
 *      and redundancy hides which line is load-bearing: deleting one would silently change nothing.
 *   3. unknown class — a row's class must still be one the catalog defines, because the class
 *      carries the artifact-check level (required/recommended/optional) and the secret warning.
 *   4. unparseable row — a row whose Artifact cell is not exactly one backticked path. Such rows
 *      are silently skipped by any validator, which defeats the point of having one.
 *
 * Scope and limits — this check proves LESS than "the catalog is correct":
 *   - It CANNOT prove the catalog lists every path aidd touches; a path handled in code but absent
 *     from the catalog is invisible to it. Adding a row is still a manual step when adding a writer.
 *   - It does not inspect per-application .gitignore files; check:fleet-aidd-entries does that.
 *
 * The detection logic is exported as a pure function so test/scripts/artifact-parity.test.ts
 * can exercise each failure mode against synthetic inputs. A checker whose own failure
 * paths are never executed is a checker nobody knows still works.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { exit } from 'node:process';

const ROOT = resolve(import.meta.dir, '..');
const CATALOG = resolve(ROOT, 'docs', 'reference', 'artifacts.md');
const SCAFFOLD = resolve(ROOT, 'scaffolding', '.gitignore');

const CLASSES = new Set([
	'generated',
	'optional',
	'recommended',
	'required',
	'runtime',
	'secret',
	'tracked',
]);
/** The one scaffold rule for aidd metadata, after parseScaffold drops the root anchor. */
const WHOLESALE = '.aidd/';

interface CatalogRow {
	class: string;
	line: number;
	path: string;
}

/** A table row for a `.aidd/` artifact: `| \`.aidd/x\` | class | … |` */
const ROW = /^\|\s*`(\.aidd\/[^`]+)`\s*\|\s*(\w+)\s*\|/;
/** Any row whose first cell mentions a `.aidd/` path, used to catch malformed rows. */
const LOOSE_ROW = /^\|[^|]*`\.aidd\/[^|]*\|/;

export const parseCatalog = (text: string): { malformed: number[]; rows: CatalogRow[] } => {
	const rows: CatalogRow[] = [];
	const malformed: number[] = [];
	text.split('\n').forEach((line, i) => {
		const m = ROW.exec(line);
		if (m) rows.push({ class: m[2]!, line: i + 1, path: m[1]! });
		else if (LOOSE_ROW.test(line)) malformed.push(i + 1);
	});
	return { malformed, rows };
};

// Both `.aidd/x` and the root-anchored `/.aidd/x` target the same path from the repo root.
// Only the leading slash differs, so normalize it away rather than skipping anchored rules —
// skipping them would silently exempt exactly the rules a stricter author is most likely to write.
export const parseScaffold = (text: string): string[] =>
	text
		.split('\n')
		.map((l) => l.trim())
		.filter((l) => l.startsWith('.aidd/') || l.startsWith('/.aidd/'))
		.map((l) => l.replace(/^\//, ''));

export function findParityProblems(
	catalogText: string,
	scaffoldText: string,
	catalogLabel = CATALOG,
	scaffoldLabel = SCAFFOLD,
): string[] {
	const { malformed, rows } = parseCatalog(catalogText);
	const rules = parseScaffold(scaffoldText);
	const problems: string[] = [];

	for (const line of malformed) {
		problems.push(
			`${catalogLabel}:${line} — row mentions a .aidd/ path but its Artifact cell is not exactly one backticked path. Split it into one row per path; a validator cannot read this form.`,
		);
	}

	for (const row of rows) {
		if (!CLASSES.has(row.class)) {
			problems.push(
				`${catalogLabel}:${row.line} — \`${row.path}\` has unknown class \`${row.class}\`.`,
			);
		}
	}

	const wholesale = rules.filter((rule) => rule === WHOLESALE);
	if (wholesale.length === 0) {
		problems.push(
			`${scaffoldLabel} — no \`/${WHOLESALE}\` rule. .aidd/ is never committed (Phillip #21448), so the scaffold must ignore it wholesale.`,
		);
	} else if (wholesale.length > 1) {
		problems.push(
			`${scaffoldLabel} — \`/${WHOLESALE}\` appears ${wholesale.length} times. The invariant is exactly one; remove the repeat.`,
		);
	}
	for (const rule of rules.filter((candidate) => candidate !== WHOLESALE)) {
		problems.push(
			`${scaffoldLabel} — rule \`${rule}\` is redundant: .aidd/ is ignored wholesale, so a per-path rule only hides which line is load-bearing. Remove it.`,
		);
	}

	return problems;
}

export function runArtifactParity(): number {
	const catalogText = readFileSync(CATALOG, 'utf8');
	const scaffoldText = readFileSync(SCAFFOLD, 'utf8');
	const problems = findParityProblems(catalogText, scaffoldText);

	if (problems.length > 0) {
		console.error('[FAIL] Artifact catalog and scaffold ignore file disagree:\n');
		for (const p of problems) console.error(`  - ${p}`);
		console.error(`\n${problems.length} problem(s). See docs/reference/artifacts.md.`);
		return 1;
	}

	const rowCount = parseCatalog(catalogText).rows.length;
	const ruleCount = parseScaffold(scaffoldText).length;
	console.log(
		`[OK] check:artifact-parity — ${rowCount} catalog rows, ${ruleCount} ignore rules, no drift.`,
	);
	return 0;
}

if (import.meta.main) exit(runArtifactParity());
