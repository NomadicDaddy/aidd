#!/usr/bin/env bun
/**
 * install-history-guard.ts — prepares each repository's dispatch, then delegates the files.
 *
 * Enforces: every repository carrying a `.aidd` directory runs the push-time guard set, or says why
 * it does not. No assertion ID: the rule spans repositories whose assertion catalogs differ.
 *
 * Installs into EVERY repository with a .aidd directory, managed ones included. Installing only into
 * local-only repositories would leave the guard's whole reason for existing unguarded: the danger is
 * a MANAGED repository quietly acquiring a push remote while its .aidd/ is tracked, which is
 * precisely how one app reached 72 tracked files and 170 commits of history unnoticed. A repository
 * with no remote today cannot be relied on to have none tomorrow, and whoever adds one will not
 * think to come back here. Installing everywhere is free: the guard's first act is to exit 0 when no
 * push remote exists, so in a managed repository it is a no-op that arms itself the moment a remote
 * appears.
 *
 * WHAT THIS SCRIPT NO LONGER DOES. The file list, the copy, idempotence by content, the executable
 * bit, and the refusal to overwrite a target's uncommitted work now belong to
 * `sync-shared-core.ts --write` for the `push-guards` group. The hook and every guard it chains are
 * still installed as one unit — that is the manifest group, which is why the group and not this
 * script is now the place a new guard has to be added. Under `set -euo pipefail` a hook installed
 * without a guard it calls is not a partial install but a push that always fails, and the loader
 * asserts a group carries everything its hook chains before any target is looked at.
 *
 * WHAT IT KEEPS, because the sync genuinely cannot do it: preparing `core.hooksPath`, and the reads
 * that decide whether preparing it is safe. See install-leak-guard.ts, which keeps the same set for
 * the same reasons; the two scripts write one hook each into the same `.githooks` directory and
 * neither may redirect a hooks path it did not set.
 *
 * The name is narrower than the job and stays for continuity: the .aidd/ feature record and the
 * install:history-guard script key both name it.
 *
 *   bun scripts/install-history-guard.ts [--dry-run] [--root <dir>]
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { argv, exit } from 'node:process';

import { AIDD_ROOT, GUARDS, HOOK, MARKER } from './lib/push-guards/contract.ts';

/** The manifest group holding the hook and every guard it chains. */
const GROUP = 'push-guards';

/**
 * The repository-relative paths that group writes.
 *
 * Narrows the staged-index refusal. The writer stages the hook it delivers, so a blanket "the index
 * is not empty" refusal would refuse every repository the previous run had just installed into,
 * turning a clean second run — which is how the rollout is verified — into a wall of false refusals.
 * What the refusal is for is not enlarging somebody ELSE'S next commit, and that is what this
 * measures.
 */
const OWNED = new Set([HOOK, ...GUARDS].map((f) => `.githooks/${f}`));

const dryRun = argv.includes('--dry-run');
const rootIdx = argv.indexOf('--root');
const FLEET_ROOT = rootIdx === -1 ? resolve(AIDD_ROOT, '..') : resolve(argv[rootIdx + 1]!);

const sh = (cwd: string, args: string[]): string => {
	const p = Bun.spawnSync(['git', ...args], { cwd, windowsHide: true });
	return p.success ? new TextDecoder().decode(p.stdout).trim() : '';
};

/** Reported only, never used to filter: the guard decides at push time, not install time. */
const hasPushRemote = (dir: string): boolean =>
	sh(dir, ['remote', '-v'])
		.split('\n')
		.some((l) => l.includes('(push)'));

/** Staged paths this sync does not own, which are the ones a write here would sweep into. */
const stagedElsewhere = (repo: string): string[] =>
	sh(repo, ['diff', '--cached', '--name-only'])
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.length > 0 && !OWNED.has(line));

const repos = readdirSync(FLEET_ROOT, { withFileTypes: true })
	.filter((e) => e.isDirectory() && !e.name.endsWith('.old'))
	.map((e) => join(FLEET_ROOT, e.name))
	.filter((d) => existsSync(join(d, '.git')) && existsSync(join(d, '.aidd')));

let prepared = 0;
let refused = 0;

for (const repo of repos) {
	const name = repo.split(/[\\/]/).pop()!;

	// Read the hook BEFORE touching core.hooksPath. A stranger's pre-push sitting in .githooks is
	// inert while the hooks path is unset; pointing the hooks path at it is what would arm it.
	const hookPath = join(repo, '.githooks', HOOK);
	if (existsSync(hookPath) && !readFileSync(hookPath, 'utf8').includes(MARKER)) {
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

	// Never redirect a hooks path this script did not set. core.hooksPath holds ONE value, so
	// pointing it at .githooks silently disables whatever it named before — and with it unset, git
	// runs .git/hooks, where tools like simple-git-hooks and Husky write. An app in this fleet lost
	// its lint-staged pre-commit to exactly this before the check existed. Git's own *.sample files
	// are inert and do not count.
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

	// Unstaged and untracked files are harmless and deliberately allowed: most of this fleet is dirty
	// most of the time, and refusing on that would mean never installing anywhere.
	const staged = stagedElsewhere(repo);
	if (staged.length > 0) {
		console.error(
			`  REFUSED ${name}: the index already holds staged changes (${staged.slice(0, 3).join(', ')}${staged.length > 3 ? ', …' : ''});\n` +
				`           installing would enlarge that commit. Commit or unstage them, then re-run.`,
		);
		refused++;
		continue;
	}

	if (configuredHooks !== '.githooks') {
		if (dryRun) console.log(`  would set core.hooksPath=.githooks: ${name}`);
		else sh(repo, ['config', 'core.hooksPath', '.githooks']);
		prepared++;
	}
}

const armed = repos.filter(hasPushRemote).length;
console.log(
	`\npush guards — dispatch prepared in ${prepared} repositor${prepared === 1 ? 'y' : 'ies'}, ` +
		`${refused} refused, across ${repos.length} discovered ` +
		`(${armed} armed, ${repos.length - armed} dormant until a remote is added).`,
);

const sync = join(AIDD_ROOT, 'scripts', 'sync-shared-core.ts');
if (!existsSync(sync)) {
	console.error(
		`\n${sync} is missing. It is a synced file owned by spernakit; run\n` +
			'  bun scripts/sync-shared-core.ts --write --group shared-core-sync\n' +
			'from spernakit to deliver it here, then re-run this.',
	);
	exit(1);
}

const args = ['scripts/sync-shared-core.ts', '--write', '--group', GROUP];
if (dryRun) args.push('--dry-run');
if (rootIdx !== -1) args.push('--fleet-root', FLEET_ROOT);

console.log(`\nDelegating the files to: bun ${args.join(' ')}`);
const child = Bun.spawnSync(['bun', ...args], {
	cwd: AIDD_ROOT,
	stderr: 'inherit',
	stdout: 'inherit',
	windowsHide: true,
});

exit(refused > 0 ? 1 : child.exitCode);
