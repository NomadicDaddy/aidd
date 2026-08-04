#!/usr/bin/env bun
/**
 * install-history-guard.ts
 *
 * Installs the pre-push hook and every guard it chains into EVERY repository with a .aidd
 * directory — managed ones included. Which guards those are, and why one script owns all of them,
 * lives in lib/push-guards/contract.ts.
 *
 * Installing only into local-only repositories would leave the guard's whole reason for existing
 * unguarded: the danger is a MANAGED repository quietly acquiring a push remote while its .aidd/ is
 * tracked, which is precisely how one app reached 72 tracked files and 170 commits of history
 * unnoticed. A repository that has no remote today cannot be relied on to have none tomorrow, and
 * whoever adds one will not think to come back here.
 *
 * Installing everywhere is free: the guard's first act is to exit 0 when no push remote exists, so
 * in a managed repository it is a no-op that arms itself automatically the moment a remote appears.
 *
 * Why an installer rather than each repo's `prepare`: most of these are not JS projects with a
 * `prepare` step, and most have no .githooks directory at all. This follows the leak-guard
 * convention — the source of truth lives in aidd/.githooks and is copied outward byte-identical; a
 * repository-local divergence is exactly the failure mode that convention exists to prevent.
 *
 * Composition: if a repository already has a pre-push hook that is NOT ours, we refuse rather than
 * overwrite. core.hooksPath allows exactly one pre-push, so a silent overwrite disables whatever
 * was there — or disables the guard on the next run of some other installer.
 *
 * The name is narrower than the job and stays for continuity: the .aidd/ feature record and the
 * install:history-guard script key both name it, and it is referenced by the not-yet-started
 * sync-shared-core proposal that would absorb it.
 *
 *   bun scripts/install-history-guard.ts [--dry-run] [--root <dir>]
 */
import { chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { argv, exit } from 'node:process';

import { AIDD_ROOT, GUARDS, HOOK, MARKER } from './lib/push-guards/contract.ts';

const dryRun = argv.includes('--dry-run');
const rootIdx = argv.indexOf('--root');
const FLEET_ROOT = rootIdx === -1 ? resolve(AIDD_ROOT, '..') : resolve(argv[rootIdx + 1]!);

const sh = (cwd: string, args: string[]): string => {
	const p = Bun.spawnSync(['git', ...args], { cwd, windowsHide: true });
	return p.success ? new TextDecoder().decode(p.stdout).trim() : '';
};

const gitOk = (cwd: string, args: string[]): boolean =>
	Bun.spawnSync(['git', ...args], { cwd, windowsHide: true }).success;

/** Reported only, never used to filter: the guard decides at push time, not install time. */
const hasPushRemote = (dir: string): boolean =>
	sh(dir, ['remote', '-v'])
		.split('\n')
		.some((l) => l.includes('(push)'));

const repos = readdirSync(FLEET_ROOT, { withFileTypes: true })
	.filter((e) => e.isDirectory() && !e.name.endsWith('.old'))
	.map((e) => join(FLEET_ROOT, e.name))
	.filter((d) => existsSync(join(d, '.git')) && existsSync(join(d, '.aidd')));

let installed = 0;
let current = 0;
let skipped = 0;
let refused = 0;

for (const repo of repos) {
	const name = repo.split(/[\\/]/).pop()!;
	const hooksDir = join(repo, '.githooks');
	const hookPath = join(hooksDir, HOOK);

	if (existsSync(hookPath)) {
		const body = readFileSync(hookPath, 'utf8');
		if (!body.includes(MARKER)) {
			console.error(
				`  REFUSED ${name}: a pre-push hook already exists and is not ours. Chain the guards into\n` +
					`           it by hand, copying the guard block from aidd/.githooks/${HOOK} rather than\n` +
					`           writing calls to ${GUARDS.join(' and ')} directly. That block\n` +
					`           captures stdin once and replays it into each guard; a plain sequence of calls\n` +
					`           does not work, because the first guard to read stdin starves the rest.`,
			);
			refused++;
			continue;
		}
	}

	// Never redirect a hooks path this script did not set. core.hooksPath holds ONE value, so
	// pointing it at .githooks silently disables whatever it named before — and with it unset, git
	// runs .git/hooks, where tools like simple-git-hooks and Husky write. An app in this fleet lost its
	// lint-staged pre-commit to exactly this before the check existed. Git's own *.sample files are
	// inert and do not count.
	const configuredHooks = sh(repo, ['config', '--local', 'core.hooksPath']);
	if (configuredHooks !== '' && configuredHooks !== '.githooks') {
		console.error(
			`  REFUSED ${name}: core.hooksPath is '${configuredHooks}'; not overriding it.`,
		);
		refused++;
		continue;
	}
	if (configuredHooks === '') {
		const legacy = join(repo, '.git', 'hooks');
		const live = existsSync(legacy)
			? readdirSync(legacy).filter((f) => !f.endsWith('.sample'))
			: [];
		if (live.length > 0) {
			console.error(
				`  REFUSED ${name}: .git/hooks holds live hooks (${live.join(', ')}) that core.hooksPath=.githooks would bypass.\n` +
					`           This repo manages hooks itself (e.g. simple-git-hooks/husky). Add the guard to that tool's config instead.`,
			);
			refused++;
			continue;
		}
	}

	// The hook and every guard it chains, as one unit. Installing the hook without a guard it calls
	// is not a partial install: `set -euo pipefail` turns the missing file into a failed push, so
	// a half-applied set is strictly worse than none. They are copied together or not at all.
	const wants: [from: string, to: string][] = [HOOK, ...GUARDS].map((f) => [
		join(AIDD_ROOT, '.githooks', f),
		join(hooksDir, f),
	]);

	// Idempotence by content comparison, not by presence. The rollout is verified by re-running and
	// confirming no changes, which a presence check cannot support — and it is a presence check that
	// let 11 repositories sit on a pre-push one generation behind while reporting as done.
	const same = ([from, to]: [string, string]): boolean =>
		existsSync(to) && readFileSync(from, 'utf8') === readFileSync(to, 'utf8');
	if (configuredHooks === '.githooks' && wants.every(same)) {
		console.log(`  current:   ${name}`);
		current++;
		continue;
	}

	// Only once there is something to write. Unstaged and untracked files elsewhere are harmless and
	// deliberately allowed: most of this fleet is dirty most of the time, and refusing on that would
	// mean never installing anywhere. Staged work is different — this script runs `git add` on what
	// it writes, so it would silently enlarge somebody else's next commit. install-leak-guard.ts has
	// refused on this from the start and its header credits this script with the same behaviour;
	// that was aspirational until now.
	//
	// The order matters and is not obvious. Checking this before the comparison above would make the
	// script refuse every repository it had just installed into, because its own `git add` leaves
	// exactly the staged index this refuses on — turning a clean second run, which is how the
	// rollout is verified, into a wall of false refusals.
	if (!gitOk(repo, ['diff', '--cached', '--quiet'])) {
		console.error(
			`  REFUSED ${name}: the index already holds staged changes; installing would enlarge that commit.\n` +
				`           Commit or unstage them, then re-run.`,
		);
		refused++;
		continue;
	}

	if (dryRun) {
		const stale = wants.filter((w) => !same(w)).map(([from]) => from.split(/[\\/]/).pop());
		console.log(`  would install: ${name}  (${stale.join(', ') || 'wiring only'})`);
		skipped++;
		continue;
	}

	mkdirSync(hooksDir, { recursive: true });
	for (const [from, to] of wants) copyFileSync(from, to);

	try {
		chmodSync(hookPath, 0o755);
	} catch {
		/* Filesystems without POSIX modes. */
	}

	// The on-disk bit is NOT enough. These repos run with core.fileMode=false (Windows), so git
	// ignores the filesystem mode and would record the hook as 100644 — and git will not execute a
	// non-executable hook on POSIX. Anyone cloning to Linux/macOS would get a silently disabled
	// guard, which is worse than no guard because the repo looks protected. Set the index mode
	// explicitly; it is the only thing that survives a clone.
	sh(repo, ['update-index', '--add', '--chmod=+x', `.githooks/${HOOK}`]);
	// The guard bodies are invoked via `bash <path>`, so they need no exec bit — matching the
	// existing leak-guard.sh convention (100644).
	sh(repo, ['add', ...GUARDS.map((g) => `.githooks/${g}`)]);

	sh(repo, ['config', 'core.hooksPath', '.githooks']);
	console.log(
		`  installed: ${name}${hasPushRemote(repo) ? '  (armed — has a push remote)' : '  (dormant — no remote yet)'}`,
	);
	installed++;
}

const armed = repos.filter(hasPushRemote).length;
console.log(
	`\npush guards — ${installed} installed, ${current} already current, ${skipped} pending (dry run), ` +
		`${refused} refused, across ${repos.length} repositories ` +
		`(${armed} armed, ${repos.length - armed} dormant until a remote is added).`,
);
exit(refused > 0 ? 1 : 0);
