#!/usr/bin/env bun
/**
 * install-leak-guard.ts — prepares each repository's dispatch, then delegates the files.
 *
 * Enforces: every repository under the fleet root runs the commit-time leak guard, or says why it
 * does not. No assertion ID: the rule spans repositories whose assertion catalogs differ.
 *
 * A token reached disk in July 2026 because the guard existed in one repository and not in the ones
 * beside it. Nothing about that is specific to the repository it happened in: the pattern file the
 * guard reads is per-machine and names every private sibling, so any repository on this machine can
 * leak any other's private literals. Installing selectively is what produced the incident.
 *
 * WHAT THIS SCRIPT NO LONGER DOES. The file list, the two hook variants, the copy decisions, the
 * seeded-once files, idempotence by content, the executable bit, and the refusal to overwrite a
 * target's uncommitted work now belong to `sync-shared-core.ts --write`, which this delegates to for
 * the `leak-guard-hooks` and `leak-guard-scripts` groups. Those were never this script's rules so
 * much as this script's copy of them, and a second copy of a sync rule drifting out of step with the
 * first is the same defect one level up that the guard exists to catch one level down.
 *
 * WHAT IT KEEPS, because the sync genuinely cannot do it. The sync reads `core.hooksPath` and
 * classifies a repository whose dispatch is not ours as `unmanaged-dispatch` — correctly, since it
 * must never redirect a hooks path it did not set. But somebody has to set it the first time, and
 * deciding whether that is safe means reading state no manifest describes: an existing hook that is
 * a stranger's, live hooks under `.git/hooks` that pointing `core.hooksPath` at `.githooks` would
 * bypass, and an index already holding somebody else's staged work. So this script prepares dispatch
 * and refuses where preparing it would break something, then hands the files over.
 *
 *   bun scripts/install-leak-guard.ts [--dry-run] [--root <dir>] [--only <csv>]
 */
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { argv, exit } from 'node:process';

import {
	AIDD_ROOT,
	GUARD_ONLY_SOURCE,
	HOOK,
	HOOK_FILES,
	SCRIPT_FILES,
	SEEDED_SCRIPTS,
	WIRING,
} from './lib/leak-guard/contract.ts';
import { discoverRepos, readScripts, repoName, sh } from './lib/leak-guard/git.ts';
import { classifyHook } from './lib/leak-guard/hook-state.ts';

/** The manifest groups that together hold everything this installer used to copy. */
const GROUPS = ['leak-guard-hooks', 'leak-guard-scripts'];

/**
 * The repository-relative paths those groups write.
 *
 * Used to narrow the staged-index refusal, and the narrowing is load-bearing rather than tidy. The
 * writer stages the hook it delivers (`update-index --add` is the only way to record an executable
 * bit on a file git does not track yet), so a blanket "the index is not empty" refusal would refuse
 * every repository the previous run had just installed into — turning a clean second run, which is
 * how the rollout is verified, into a wall of false refusals. What the refusal is actually for is
 * not enlarging somebody ELSE'S next commit, and that is what this measures.
 */
const OWNED = new Set([
	...[HOOK, GUARD_ONLY_SOURCE, ...HOOK_FILES].map((f) => `.githooks/${f}`),
	...[...SCRIPT_FILES, ...SEEDED_SCRIPTS].map((f) => `scripts/${f}`),
]);

const dryRun = argv.includes('--dry-run');
const flag = (name: string): string | undefined => {
	const i = argv.indexOf(name);
	return i === -1 ? undefined : argv[i + 1];
};
const rootArg = flag('--root');
const FLEET_ROOT = rootArg === undefined ? resolve(AIDD_ROOT, '..') : resolve(rootArg);
const onlyArg = flag('--only');
const only = onlyArg === undefined ? undefined : new Set(onlyArg.split(',').map((s) => s.trim()));

/** Staged paths this sync does not own, which are the ones a write here would sweep into. */
function stagedElsewhere(repo: string): string[] {
	return sh(repo, ['diff', '--cached', '--name-only'])
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.length > 0 && !OWNED.has(line));
}

const repos = discoverRepos(FLEET_ROOT, only);

let prepared = 0;
let refused = 0;
const wiring: string[] = [];

for (const repo of repos) {
	const name = repoName(repo);

	// Read the hook BEFORE touching core.hooksPath. A stranger's pre-commit sitting in .githooks is
	// inert while the hooks path is unset; pointing the hooks path at it is what would arm it.
	const state = classifyHook(join(repo, '.githooks', HOOK));
	if (state.kind === 'foreign' || state.kind === 'stale') {
		console.error(`  REFUSED ${name}: ${state.reason}`);
		refused++;
		continue;
	}

	// Never redirect a hooks path this script did not set. core.hooksPath holds ONE value, so
	// pointing it at .githooks silently disables whatever it named before — and with it unset, git
	// runs .git/hooks, where tools like simple-git-hooks and Husky write. Git's own *.sample files
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

	// Reported and never written: editing a target's package.json from here would reformat it to this
	// repository's conventions rather than its own. The sync reports the missing keys too, as
	// `unwired` findings; this adds the value to paste, which the manifest holds and the finding
	// does not. Collected for every repository that passed the refusals rather than only the ones
	// receiving files, because a repository can be file-current and still unwired.
	const scripts = readScripts(repo);
	if (scripts !== undefined) {
		const todo = Object.entries(WIRING)
			.filter(([key]) => !(key in scripts))
			.map(([key, value]) => `"${key}": ${JSON.stringify(value)}`);
		if (todo.length > 0)
			wiring.push(`  ${name}: add to package.json scripts —\n    ${todo.join('\n    ')}`);
	}
}

console.log(
	`\nleak guard — dispatch prepared in ${prepared} repositor${prepared === 1 ? 'y' : 'ies'}, ` +
		`${refused} refused, across ${repos.length} discovered.`,
);

// Hand the files over. `--fleet-root` is passed only when --root moved us off the default, which is
// the same directory sync-shared-core would derive on its own from aidd's parent.
const sync = join(AIDD_ROOT, 'scripts', 'sync-shared-core.ts');
if (!existsSync(sync)) {
	console.error(
		`\n${sync} is missing. It is a synced file owned by spernakit; run\n` +
			'  bun scripts/sync-shared-core.ts --write --group shared-core-sync\n' +
			'from spernakit to deliver it here, then re-run this.',
	);
	exit(1);
}

const args = ['scripts/sync-shared-core.ts', '--write', ...GROUPS.flatMap((g) => ['--group', g])];
if (dryRun) args.push('--dry-run');
if (rootArg !== undefined) args.push('--fleet-root', FLEET_ROOT);
if (onlyArg !== undefined) args.push('--only', onlyArg);

console.log(`\nDelegating the files to: bun ${args.join(' ')}`);
const child = Bun.spawnSync(['bun', ...args], {
	cwd: AIDD_ROOT,
	stderr: 'inherit',
	stdout: 'inherit',
	windowsHide: true,
});

if (wiring.length > 0) {
	console.log(`\nScript wiring still to do by hand (formatting is the target repo's, not ours):`);
	for (const line of wiring) console.log(line);
}

exit(refused > 0 ? 1 : child.exitCode);
