#!/usr/bin/env bun
/**
 * check-artifact-parity.ts
 *
 * Enforces: DATA-001 and DATA-005 -- docs/reference/artifacts.md is the complete catalog of
 * every `.aidd/` path aidd recognizes, scaffolding/.gitignore is its derived projection, and
 * artifact health stays observable from code and metadata rather than by inspection.
 *
 * Four failures are caught:
 *   1. class/rule disagreement — a committed row that an ignore rule matches (it
 *      would never be committed), or a non-committed row with no rule (it would be
 *      committed silently). The second is how runs.jsonl came to be tracked in six
 *      applications despite the catalog calling it `runtime`.
 *   2. redundant rules — the documented invariant is EXACTLY one matching rule.
 *   3. orphan rule — an ignore rule with no catalog row, i.e. an artifact being
 *      hidden that nothing documents.
 *   4. unparseable row — a row whose Artifact cell is not exactly one backticked
 *      path. Such rows are silently skipped by any validator, which defeats the
 *      point of having one.
 *
 * There is deliberately no class for artifacts aidd does not write — a rule kept only to hide
 * files nobody produces is indistinguishable from drift, and it defeats the orphan-rule check above.
 *
 * Scope and limits — this check proves LESS than "the catalog is correct":
 *   - It compares the catalog to the scaffold. It CANNOT prove the catalog lists
 *     every path aidd touches; a path handled in code but absent from both files is
 *     invisible to it. Adding a row is still a manual step when adding a writer.
 *   - It does not inspect per-application .gitignore files, nor enumerate .aidd/
 *     in managed applications, so it cannot see an unclassified file on disk.
 *   - Its gitignore matching approximates the shapes the scaffold uses; it is not
 *     a full gitignore implementation.
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

const COMMITTED = new Set(['optional', 'recommended', 'required', 'tracked']);
const NOT_COMMITTED = new Set(['generated', 'runtime', 'secret']);

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

/** Approximates gitignore matching for the shapes the scaffold actually uses. */
export const matches = (path: string, rule: string): boolean => {
	const r = rule.replace(/\/$/, '');
	const p = path.replace(/\/$/, '');
	if (rule.endsWith('/')) return p === r || p.startsWith(`${r}/`);
	if (rule.includes('*')) {
		const rx = new RegExp(`^${r.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);
		return rx.test(p);
	}
	return p === r || p.startsWith(`${r}/`);
};

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
		if (!COMMITTED.has(row.class) && !NOT_COMMITTED.has(row.class)) {
			problems.push(
				`${catalogLabel}:${row.line} — \`${row.path}\` has unknown class \`${row.class}\`.`,
			);
			continue;
		}
		const matching = rules.filter((r) => matches(row.path, r));
		const committed = COMMITTED.has(row.class);
		const ruleList = matching.map((r) => `\`${r}\``).join(', ');
		if (committed && matching.length > 0) {
			problems.push(
				`${catalogLabel}:${row.line} — \`${row.path}\` is \`${row.class}\` (committed) but ${scaffoldLabel} hides it via ${ruleList}. It would never be committed.`,
			);
		} else if (!committed && matching.length === 0) {
			problems.push(
				`${catalogLabel}:${row.line} — \`${row.path}\` is \`${row.class}\` (not committed) but no ${scaffoldLabel} rule matches it. It would be committed silently.`,
			);
		} else if (!committed && matching.length > 1) {
			// The documented invariant is EXACTLY one rule. Overlapping rules are not a Git error, but
			// they mean deleting one rule silently changes nothing — so the next author cannot tell
			// which rule is load-bearing, and drift hides behind the redundancy.
			problems.push(
				`${catalogLabel}:${row.line} — \`${row.path}\` is matched by ${matching.length} rules (${ruleList}). The invariant is exactly one; remove the redundant rule.`,
			);
		}
	}

	for (const rule of rules) {
		if (!rows.some((row) => matches(row.path, rule))) {
			problems.push(
				`${scaffoldLabel} — rule \`${rule}\` has no row in the catalog. Add one to docs/reference/artifacts.md, or drop the rule.`,
			);
		}
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
