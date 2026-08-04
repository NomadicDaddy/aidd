#!/usr/bin/env bun
/**
 * install-leak-guard.ts
 *
 * Installs the commit-time leak guard into every repository in the fleet.
 *
 * A token reached disk in July 2026 because the guard existed in one repository and not in the ones
 * beside it. Nothing about that is specific to the repository it happened in: the pattern file the
 * guard reads is per-machine and names every private sibling, so any repository on this machine can
 * leak any other's private literals. Installing selectively is what produced the incident.
 *
 * Following install-history-guard.ts: source of truth in aidd/.githooks, copied outward
 * byte-identical, discovery rather than a roster. What the suite is and which of its files are
 * synced rather than seeded lives in lib/leak-guard/contract.ts; how an existing hook is read
 * before anything is written over it lives in lib/leak-guard/hook-state.ts.
 *
 * Five refusals. Four are shared with install-history-guard.ts and sync-license-core.ts: a foreign
 * pre-commit, a core.hooksPath this script did not set, live hooks under .git/hooks that pointing
 * core.hooksPath at .githooks would bypass, and an index that already holds staged work — this
 * script stages what it writes, so it would silently enlarge someone else's next commit. The fifth
 * is a hook that calls the guard but neither matches a current variant nor declares itself a local
 * chain; see hook-state.ts for why that one cannot be decided from content.
 *
 *   bun scripts/install-leak-guard.ts [--dry-run] [--root <dir>] [--only <csv>]
 */
import { chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { argv, exit } from 'node:process';

import {
	AIDD_ROOT,
	CONTRACT,
	GUARD_ONLY_SOURCE,
	HOOK,
	HOOK_FILES,
	SCRIPT_FILES,
	SEEDED_SCRIPTS,
	WIRING,
} from './lib/leak-guard/contract.ts';
import {
	discoverRepos,
	gitOk,
	hasPushRemote,
	readScripts,
	repoName,
	sh,
} from './lib/leak-guard/git.ts';
import { classifyHook } from './lib/leak-guard/hook-state.ts';

const dryRun = argv.includes('--dry-run');
const flag = (name: string): string | undefined => {
	const i = argv.indexOf(name);
	return i === -1 ? undefined : argv[i + 1];
};
const rootArg = flag('--root');
const FLEET_ROOT = rootArg === undefined ? resolve(AIDD_ROOT, '..') : resolve(rootArg);
const onlyArg = flag('--only');
const only = onlyArg === undefined ? undefined : new Set(onlyArg.split(',').map((s) => s.trim()));

const repos = discoverRepos(FLEET_ROOT, only);

let installed = 0;
let current = 0;
let pending = 0;
let refused = 0;
const wiring: string[] = [];

for (const repo of repos) {
	const name = repoName(repo);
	const hooksDir = join(repo, '.githooks');
	const hookPath = join(hooksDir, HOOK);

	const state = classifyHook(hookPath);
	if (state.kind === 'foreign' || state.kind === 'stale') {
		console.error(`  REFUSED ${name}: ${state.reason}`);
		refused++;
		continue;
	}
	const chained = state.kind === 'chain';

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

	// Unstaged and untracked files elsewhere are harmless and deliberately allowed: most of this
	// fleet is dirty most of the time, and refusing on that would mean never installing anywhere.
	if (!gitOk(repo, ['diff', '--cached', '--quiet'])) {
		console.error(
			`  REFUSED ${name}: the index already holds staged changes; installing would enlarge that commit.\n` +
				`           Commit or unstage them, then re-run.`,
		);
		refused++;
		continue;
	}

	const scripts = readScripts(repo);
	const missing = scripts === undefined ? [...CONTRACT] : CONTRACT.filter((k) => !(k in scripts));
	const mode = missing.length === 0 ? 'full' : 'guard-only';
	const label = chained ? 'chained' : mode;
	const why = chained
		? 'local hook already calls the guard; left as written'
		: scripts === undefined
			? 'no package.json'
			: `no ${missing.join(', ')}`;

	// Idempotence is a property this script is checked against, not a convenience: the rollout is
	// verified by re-running it and confirming it reports no changes. Comparing content also means a
	// repository that drifted — spernakit-htmx sat two generations behind on all four files — is
	// reported as stale rather than as done.
	const from = (dir: string, f: string): [string, string] => [
		join(AIDD_ROOT, dir, f),
		join(dir === '.githooks' ? hooksDir : join(repo, 'scripts'), f),
	];
	const wants: [string, string][] = [
		...HOOK_FILES.map((f) => from('.githooks', f)),
		...(chained
			? []
			: [
					[
						join(AIDD_ROOT, '.githooks', mode === 'full' ? HOOK : GUARD_ONLY_SOURCE),
						hookPath,
					] as [string, string],
				]),
		...(scripts === undefined ? [] : SCRIPT_FILES.map((f) => from('scripts', f))),
	];
	const seeds: [string, string][] =
		scripts === undefined
			? []
			: SEEDED_SCRIPTS.map((f) => from('scripts', f)).filter(([, to]) => !existsSync(to));

	const same = (a: string, b: string): boolean =>
		existsSync(b) && readFileSync(a, 'utf8') === readFileSync(b, 'utf8');
	if (
		configuredHooks === '.githooks' &&
		seeds.length === 0 &&
		wants.every(([a, b]) => same(a, b))
	) {
		console.log(`  current:   ${name}  [${label}]`);
		current++;
		continue;
	}

	if (dryRun) {
		console.log(`  would install: ${name}  [${label}]${label === 'full' ? '' : `  (${why})`}`);
		pending++;
		continue;
	}

	mkdirSync(hooksDir, { recursive: true });
	if (scripts !== undefined) mkdirSync(join(repo, 'scripts'), { recursive: true });
	for (const [src, dest] of [...wants, ...seeds]) copyFileSync(src, dest);

	const staged = [
		...HOOK_FILES.map((f) => `.githooks/${f}`),
		...(scripts === undefined ? [] : SCRIPT_FILES.map((f) => `scripts/${f}`)),
		...seeds.map(([src]) => `scripts/${repoName(src)}`),
	];

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
	// The bodies are invoked via `bash <path>` and need no exec bit, matching the existing
	// leak-guard.sh convention (100644).
	sh(repo, ['add', ...staged]);

	sh(repo, ['config', 'core.hooksPath', '.githooks']);

	if (scripts !== undefined) {
		const todo = Object.entries(WIRING)
			.filter(([key]) => !(key in scripts))
			.map(([key, value]) => `"${key}": ${JSON.stringify(value)}`);
		if (todo.length > 0)
			wiring.push(`  ${name}: add to package.json scripts —\n    ${todo.join('\n    ')}`);
	}

	console.log(
		`  installed: ${name}  [${label}]${label === 'full' ? '' : `  (${why})`}` +
			`${hasPushRemote(repo) ? '  (published)' : ''}`,
	);
	installed++;
}

if (wiring.length > 0) {
	console.log(`\nScript wiring still to do by hand (formatting is the target repo's, not ours):`);
	for (const line of wiring) console.log(line);
}

console.log(
	`\nleak guard — ${installed} installed, ${current} already current, ${pending} pending (dry run), ` +
		`${refused} refused, across ${repos.length} repositories.`,
);
exit(refused > 0 ? 1 : 0);
