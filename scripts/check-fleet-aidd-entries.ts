#!/usr/bin/env bun
/**
 * check-fleet-aidd-entries.ts
 *
 * Enforces: DATA-001 -- project metadata remains rooted in `.aidd/`, checked against what is
 * actually on disk in every application rather than against this repository's own catalog.
 *
 * Sweeps every repository with a `.aidd/` and fails on anything the policy does not account for.
 *
 * `check:artifact-parity` proves aidd's catalog agrees with aidd's scaffold — both files inside this
 * repository. It cannot see a single real project. This is the other half: does what is actually on
 * disk, in every application, match the rule?
 *
 * One rule for every repository (Phillip #21448): `.aidd/` is never committed. Each repository must
 *   1. track nothing under `.aidd/` — the same requirement the pre-push history guard enforces at
 *      push time, checked here before someone runs `git add .` rather than after; and
 *   2. have an ignore rule that actually covers `.aidd/`, so the next `git add .` cannot undo 1.
 * It also reports any narrower `.aidd/...` line left in .gitignore beside `/.aidd/` (#21467), and any
 * top-level `.aidd/` entry the catalog doesn't know, because the catalog in
 * docs/reference/artifacts.md is meant to name every path aidd recognizes.
 *
 * REPOSITORIES ARE DISCOVERED, NEVER LISTED. Every hardcoded inventory in this effort went stale
 * within hours: the fleet gained a repository, then another turned out misclassified, then a
 * directory consolidation added two more. A sweep that reads a list would have missed all of them,
 * which is precisely the failure it exists to prevent.
 *
 *   bun scripts/check-fleet-aidd-entries.ts [--root <dir>]
 *
 * Exit 1 if any repository tracks `.aidd/`, lacks a rule covering it, or holds an unclassified entry.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { argv, exit } from 'node:process';
import { parseArgs } from 'node:util';

import { parseCatalog } from './check-artifact-parity.ts';

const AIDD_ROOT = resolve(import.meta.dir, '..');

/**
 * Entries that exist in real `.aidd/` directories but are NOT aidd artifacts, so they have no
 * catalog row and never will. Keep this list short and justified — every addition is an admission
 * that something writes into `.aidd/` without owning it.
 */
const NON_AIDD = new Set([
	// Stray: no skill references .aidd/apply-ui. File deleted 2026-07-16.
	'apply-ui',
	// Agents redirect a dev server here ad hoc (`bun run dev > .aidd/dev-server.log`).
	'dev-server.err.log',
	'dev-server.log',
	'dev-server.out.log',
	// spernakit/scripts/template-sync-plan.ts writes upgrade-review/<app>/ under the template root,
	// but takes --outDir, and a template upgrade run pointed one here.
	'upgrade-review',
]);

const git = (cwd: string, args: string[]): { ok: boolean; stdout: string } => {
	const p = Bun.spawnSync(['git', ...args], { cwd, windowsHide: true });
	return { ok: p.success, stdout: new TextDecoder().decode(p.stdout).trim() };
};

/** Catalog paths are `.aidd/x` or `.aidd/x/`; reduce to the top-level entry name. */
const topLevel = (p: string): string => p.replace(/^\.aidd\//, '').replace(/\/.*$/, '');

function loadCatalog(): Set<string> {
	return new Set(
		parseCatalog(
			readFileSync(join(AIDD_ROOT, 'docs', 'reference', 'artifacts.md'), 'utf8'),
		).rows.map((row) => topLevel(row.path)),
	);
}

export interface FleetEntriesOptions {
	root: string;
}

export function parseFleetEntriesArgs(args: string[]): FleetEntriesOptions {
	const { values } = parseArgs({ args, options: { root: { type: 'string' } }, strict: true });
	// parseArgs takes the token after `--root` as its value even when that token is itself a flag,
	// so a mistyped invocation would sweep a directory named after the flag, discover no
	// repositories, and report the fleet clean.
	if (values.root !== undefined && (values.root.trim() === '' || values.root.startsWith('-'))) {
		throw new Error('--root requires a directory path.');
	}
	return { root: values.root === undefined ? resolve(AIDD_ROOT, '..') : resolve(values.root) };
}

/** Nothing tracked, a rule that covers `.aidd/`, and every top-level entry known. */
function inspectRepository(repo: string, name: string, catalog: Set<string>): string[] {
	const problems: string[] = [];
	const tracked = git(repo, ['ls-files', '.aidd']).stdout.split('\n').filter(Boolean);
	if (tracked.length > 0) {
		problems.push(
			`${name}: ${tracked.length} tracked .aidd path(s); untrack them with git rm -r --cached .aidd`,
		);
	}
	// `git check-ignore` consults the index, so a tracked file is never reported ignored —
	// --no-index asks the question the rules actually answer.
	const covered = Bun.spawnSync(['git', 'check-ignore', '-q', '--no-index', '.aidd/probe'], {
		cwd: repo,
		windowsHide: true,
	}).success;
	if (!covered) problems.push(`${name}: no ignore rule covers .aidd/; add /.aidd/ to .gitignore`);
	// The single /.aidd/ line covers the whole folder, so any narrower .aidd rule beside it is dead
	// weight that hides which line is load-bearing (Phillip via Steward #21467).
	const ignoreFile = join(repo, '.gitignore');
	const extra = existsSync(ignoreFile)
		? readFileSync(ignoreFile, 'utf8')
				.split('\n')
				.map((line) => line.trim())
				.filter((line) => /^\/?\.aidd\/./.test(line))
		: [];
	if (extra.length > 0) {
		problems.push(
			`${name}: ${extra.length} per-path .aidd rule(s) in .gitignore beside /.aidd/ (${extra.slice(0, 3).join(', ')}); keep only /.aidd/`,
		);
	}
	for (const entry of readdirSync(join(repo, '.aidd'))) {
		if (!catalog.has(entry) && !NON_AIDD.has(entry)) {
			problems.push(
				`${name}: .aidd/${entry} is UNCLASSIFIED. Add a row to docs/reference/artifacts.md, or list it in this script's NON_AIDD set.`,
			);
		}
	}
	return problems;
}

export function runFleetAiddEntries(options: FleetEntriesOptions): number {
	const catalog = loadCatalog();
	const repos = readdirSync(options.root, { withFileTypes: true })
		.filter((e) => e.isDirectory() && !e.name.endsWith('.old'))
		.map((e) => join(options.root, e.name))
		.filter((d) => existsSync(join(d, '.git')) && existsSync(join(d, '.aidd')));

	const problems: string[] = [];
	for (const repo of repos) {
		problems.push(...inspectRepository(repo, repo.split(/[\\/]/).pop()!, catalog));
	}
	console.log(`swept ${repos.length} repositories`);

	// Rule 5. The sweep discovers its own population by reading the applications root, and every
	// filter in that chain silently drops what it does not match. A wrong `--root` produces zero
	// repositories, zero problems, and a pass -- the same verdict a clean fleet earns.
	if (repos.length === 0) {
		console.error(`[FAIL] fleet .aidd entries: no repositories found under ${options.root}.`);
		console.error('  A sweep that swept nothing cannot assert that every entry is classified.');
		return 1;
	}

	if (problems.length === 0) {
		console.log(
			`[OK] fleet .aidd entries — ${repos.length} repositories examined; .aidd/ is untracked ` +
				'and ignored in each, and every entry is classified.',
		);
		return 0;
	}
	for (const p of problems) console.error(`  ${p}`);
	console.error(`\n[FAIL] fleet .aidd entries: ${problems.length} problem(s).`);
	return 1;
}

if (import.meta.main) {
	let options: FleetEntriesOptions;
	try {
		options = parseFleetEntriesArgs(argv.slice(2));
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		console.error(`[FAIL] check-fleet-aidd-entries: ${message}`);
		console.error('Usage: bun scripts/check-fleet-aidd-entries.ts [--root <dir>]');
		exit(2);
	}
	exit(runFleetAiddEntries(options));
}
