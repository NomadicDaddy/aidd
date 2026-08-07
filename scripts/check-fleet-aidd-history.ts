#!/usr/bin/env bun
/**
 * check-fleet-aidd-history.ts
 *
 * Enforces: SEC-003 -- repository-bounded work stays explicit, which a repository one push away
 * from publishing its `.aidd/` history is not.
 *
 * Runs the same three checks as the pre-push guard across every local-only repository, without
 * pushing anything.
 *
 * The hook only fires when someone pushes. This answers the standing question — "is any repository
 * one push away from publishing .aidd/?" — which is how one app accumulated 72 tracked files and
 * 170 commits of history unnoticed. Run it from fleet governance, not smoke:qc: it needs the
 * network and the sibling repositories on disk, neither of which smoke:qc can assume.
 *
 *   bun scripts/check-fleet-aidd-history.ts [--root <dir>] [--no-fetch]
 *
 * Exit 1 if any repository would be blocked.
 */
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { argv, exit } from 'node:process';
import { parseArgs } from 'node:util';

const AIDD_ROOT = resolve(import.meta.dir, '..');

const git = (cwd: string, args: string[]): string => {
	const p = Bun.spawnSync(['git', ...args], { cwd, windowsHide: true });
	return p.success ? new TextDecoder().decode(p.stdout).trim() : '';
};

interface Finding {
	blocked: boolean;
	detail: string[];
	repo: string;
}

export interface FleetHistoryOptions {
	/** False skips the remote fetch, which makes the unpublished-commit answer a cached guess. */
	fetch: boolean;
	root: string;
}

export function parseFleetHistoryArgs(args: string[]): FleetHistoryOptions {
	const { values } = parseArgs({
		args,
		options: { 'no-fetch': { type: 'boolean' }, root: { type: 'string' } },
		strict: true,
	});
	// parseArgs takes the token after `--root` as its value even when that token is itself a flag,
	// so `--root --no-fetch` would sweep a directory named `--no-fetch`, find no repositories, and
	// report the fleet clean.
	if (values.root !== undefined && (values.root.trim() === '' || values.root.startsWith('-'))) {
		throw new Error('--root requires a directory path.');
	}
	return {
		fetch: values['no-fetch'] !== true,
		root: values.root === undefined ? resolve(AIDD_ROOT, '..') : resolve(values.root),
	};
}

function inspectRepo(repo: string, doFetch: boolean): Finding | null {
	const name = repo.split(/[\\/]/).pop()!;
	const remotes = git(repo, ['remote', '-v']);
	// Managed: no push remote, .aidd tracked on purpose. Not a finding.
	if (!remotes.includes('(push)')) return null;

	const remoteName = git(repo, ['remote']).split('\n')[0]!;
	const detail: string[] = [];

	// 1. blanket rule present
	const probe = Bun.spawnSync(['git', 'check-ignore', '-q', '--no-index', '.aidd/probe'], {
		cwd: repo,
		windowsHide: true,
	});
	if (!probe.success) detail.push('no ignore rule covers .aidd/');

	// 2. nothing tracked
	const tracked = git(repo, ['ls-files', '.aidd']).split('\n').filter(Boolean);
	if (tracked.length > 0) detail.push(`${tracked.length} tracked .aidd path(s)`);

	// 3. no unpublished .aidd history. Fetch so the exclusion is trustworthy rather than a guess —
	// remote-tracking refs are a cache, and a stale one exempts commits that were never published.
	//
	// Scoped to THIS remote (--remotes=<name>), never a bare --remotes: the bare form excludes
	// anything reachable from any remote, so .aidd history on a private backup would mask itself
	// and this sweep would call a repository clean while a push to its public remote leaks.
	if (doFetch) git(repo, ['fetch', '--quiet', '--prune', remoteName]);
	const unpublished = git(repo, [
		'rev-list',
		'HEAD',
		'--not',
		`--remotes=${remoteName}`,
		'--',
		'.aidd',
	])
		.split('\n')
		.filter(Boolean);
	if (unpublished.length > 0)
		detail.push(`${unpublished.length} unpublished commit(s) touching .aidd`);

	// Informational only: history already on this remote cannot be un-published, so it never blocks.
	const published = git(repo, ['rev-list', `--remotes=${remoteName}`, '--', '.aidd'])
		.split('\n')
		.filter(Boolean);

	if (detail.length === 0 && published.length === 0) return null;
	return {
		blocked: detail.length > 0,
		detail: [
			...detail,
			...(published.length > 0 ? [`(${published.length} already published — accepted)`] : []),
		],
		repo: name,
	};
}

export function runFleetAiddHistory(options: FleetHistoryOptions): number {
	const repos = readdirSync(options.root, { withFileTypes: true })
		.filter((e) => e.isDirectory() && !e.name.endsWith('.old'))
		.map((e) => join(options.root, e.name))
		.filter((d) => existsSync(join(d, '.git')) && existsSync(join(d, '.aidd')));

	const findings = repos
		.map((repo) => inspectRepo(repo, options.fetch))
		.filter((f): f is Finding => f !== null);

	if (findings.length === 0) {
		console.log('[OK] fleet .aidd history — all local-only repositories clean.');
		return 0;
	}

	for (const f of findings) {
		const marker = f.blocked ? '[FAIL] BLOCKED' : '[WARN] note   ';
		console.log(`${marker}  ${f.repo}: ${f.detail.join('; ')}`);
	}

	const blocked = findings.filter((f) => f.blocked).length;
	console.log(`\n${blocked} repository/repositories would be blocked from pushing.`);
	return blocked > 0 ? 1 : 0;
}

if (import.meta.main) {
	let options: FleetHistoryOptions;
	try {
		options = parseFleetHistoryArgs(argv.slice(2));
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		console.error(`[FAIL] check-fleet-aidd-history: ${message}`);
		console.error('Usage: bun scripts/check-fleet-aidd-history.ts [--root <dir>] [--no-fetch]');
		exit(2);
	}
	exit(runFleetAiddHistory(options));
}
