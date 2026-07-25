#!/usr/bin/env bun
/**
 * check-fleet-aidd-entries.ts
 *
 * Sweeps every repository with a `.aidd/` and fails on anything the policy does not account for.
 *
 * `check:artifact-parity` proves aidd's catalog agrees with aidd's scaffold — both files inside this
 * repository. It cannot see a single real project. This is the other half: does what is actually on
 * disk, in every application, match what the catalog says should be there?
 *
 * Three questions, per repository:
 *   1. Is every top-level `.aidd/` entry CLASSIFIED? An unknown entry is not merely undocumented —
 *      the managed profile is a denylist, so anything unrecognised is tracked by default. That is
 *      how a stray gets committed and how a secret-bearing file would.
 *   2. Does the DISPOSITION hold? Catalog says committed → it must be tracked. Says not → it must be
 *      ignored. A rule that exists but does not bite is indistinguishable from no rule.
 *   3. Do local-only repositories hide `.aidd/` wholesale?
 *
 * Dispositions are read from docs/reference/artifacts.md rather than restated here: a second copy of
 * the policy is a second thing to forget to update, and the catalog is already the source of truth
 * that check:artifact-parity enforces.
 *
 * REPOSITORIES ARE DISCOVERED, NEVER LISTED. Every hardcoded inventory in this effort went stale
 * within hours: the fleet gained a repository, then another turned out misclassified, then a
 * directory consolidation added two more. A sweep that reads a list would have missed all of them,
 * which is precisely the failure it exists to prevent.
 *
 *   bun scripts/check-fleet-aidd-entries.ts [--root <dir>]
 *
 * Exit 1 if any repository has an unclassified entry or a disposition violation.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { argv, exit } from 'node:process';

import { parseCatalog } from './check-artifact-parity.ts';

const AIDD_ROOT = resolve(import.meta.dir, '..');
const rootIdx = argv.indexOf('--root');
const FLEET_ROOT = rootIdx === -1 ? resolve(AIDD_ROOT, '..') : resolve(argv[rootIdx + 1]!);

const COMMITTED = new Set(['optional', 'recommended', 'required', 'tracked']);

/**
 * Entries that exist in real `.aidd/` directories but are NOT aidd artifacts, so they have no
 * catalog row and never will. Keep this list short and justified — every addition is an admission
 * that something writes into `.aidd/` without owning it.
 */
const NON_AIDD: Record<string, 'ignore'> = {
	// Stray: no skill references .aidd/apply-ui. File deleted 2026-07-16; the rule stays only
	// because a stray costs nothing to exclude and everything to commit.
	'apply-ui': 'ignore',
	// Agents redirect a dev server here ad hoc (`bun run dev > .aidd/dev-server.log`). No script
	// produces it, but it recurs, so the rule outlives the files that were deleted.
	'dev-server.err.log': 'ignore',
	'dev-server.log': 'ignore',
	'dev-server.out.log': 'ignore',
	// Stray: tester skills write {APP_DIR}/screenshots/, never .aidd/screenshots/.
	screenshots: 'ignore',
};

/** Curated, human-authored files that live under .aidd/ and are tracked on purpose. */
const NON_AIDD_TRACKED = new Set([
	// A curated register of parked work, migrated from a deleted docs/TBD.md and the only copy of
	// it. No aidd code writes it. Deeper only.
	'deferred-tasks.md',
]);

const git = (cwd: string, args: string[]): { ok: boolean; stdout: string } => {
	const p = Bun.spawnSync(['git', ...args], { cwd, windowsHide: true });
	return { ok: p.success, stdout: new TextDecoder().decode(p.stdout).trim() };
};

/** Catalog paths are `.aidd/x` or `.aidd/x/`; reduce to the top-level entry name. */
const topLevel = (p: string): string => p.replace(/^\.aidd\//, '').replace(/\/.*$/, '');

const catalog = new Map<string, string>();
for (const row of parseCatalog(
	readFileSync(join(AIDD_ROOT, 'docs', 'reference', 'artifacts.md'), 'utf8'),
).rows) {
	catalog.set(topLevel(row.path), row.class);
}

const repos = readdirSync(FLEET_ROOT, { withFileTypes: true })
	.filter((e) => e.isDirectory() && !e.name.endsWith('.old'))
	.map((e) => join(FLEET_ROOT, e.name))
	.filter((d) => existsSync(join(d, '.git')) && existsSync(join(d, '.aidd')));

const problems: string[] = [];
let managed = 0;
let localOnly = 0;

for (const repo of repos) {
	const name = repo.split(/[\\/]/).pop()!;
	const isLocalOnly = git(repo, ['remote', '-v']).stdout.includes('(push)');

	if (isLocalOnly) {
		localOnly++;
		// Nothing under .aidd/ may be tracked, and the blanket rule must actually cover it.
		const tracked = git(repo, ['ls-files', '.aidd']).stdout.split('\n').filter(Boolean);
		if (tracked.length > 0) {
			problems.push(`${name}: local-only but ${tracked.length} tracked .aidd path(s)`);
		}
		const covered = Bun.spawnSync(['git', 'check-ignore', '-q', '--no-index', '.aidd/probe'], {
			cwd: repo,
			windowsHide: true,
		}).success;
		if (!covered) problems.push(`${name}: local-only but no rule covers .aidd/`);
		continue;
	}

	managed++;
	for (const entry of readdirSync(join(repo, '.aidd'))) {
		const cls = catalog.get(entry);
		const known = cls !== undefined || entry in NON_AIDD || NON_AIDD_TRACKED.has(entry);
		if (!known) {
			problems.push(
				`${name}: .aidd/${entry} is UNCLASSIFIED — the denylist tracks it by default. Add a row to docs/reference/artifacts.md, or classify it in this script's NON_AIDD list.`,
			);
			continue;
		}

		// Disposition. `git check-ignore` consults the index, so a tracked file is never reported
		// ignored — --no-index asks the question the rules actually answer.
		const path = `.aidd/${entry}`;
		const ignored = Bun.spawnSync(['git', 'check-ignore', '-q', '--no-index', path], {
			cwd: repo,
			windowsHide: true,
		}).success;
		const shouldCommit =
			NON_AIDD_TRACKED.has(entry) || (cls !== undefined && COMMITTED.has(cls));

		if (shouldCommit && ignored) {
			problems.push(
				`${name}: ${path} is committed-class (${cls ?? 'curated'}) but an ignore rule hides it`,
			);
		} else if (!shouldCommit && !ignored) {
			problems.push(
				`${name}: ${path} is ${cls ?? 'non-aidd'} (not committed) but no ignore rule matches it — it will be tracked`,
			);
		}
	}
}

console.log(`swept ${repos.length} repositories (${localOnly} local-only, ${managed} managed)`);
if (problems.length === 0) {
	console.log('fleet .aidd entries — every entry classified, every disposition holds.');
	exit(0);
}
for (const p of problems) console.error(`  ${p}`);
console.error(`\n${problems.length} problem(s).`);
exit(1);
