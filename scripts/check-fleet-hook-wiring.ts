#!/usr/bin/env bun
/**
 * check-fleet-hook-wiring.ts
 *
 * Enforces: SEC-003 -- repository-bounded work stays explicit. A guard that reads as installed and
 * does not fire makes the bound a claim rather than a fact.
 *
 * Sweeps every repository in the fleet and fails on a guard that reads as installed and does not
 * fire.
 *
 * The installers prove that a guard was copied. Nothing proved it still runs. Three real states
 * found this way, none of which any existing check noticed: aidd-build-proofs-public pointed
 * core.hooksPath at a directory that did not exist, so no hook ran at all; eleven repositories
 * carry a pre-push generation whose successor calls a screenshot guard they do not have, so
 * installing the current one would fail every push; and a hook recorded 100644 by a
 * core.fileMode=false checkout is silently disabled the moment it is cloned to Linux.
 *
 * Five questions, per repository:
 *   1. Does core.hooksPath name a directory that exists?
 *   2. Does every hook in the active directory call only scripts that are there?
 *   3. Is every hook recorded executable in the index, not just on this filesystem?
 *   4. If the leak guard is present, does an active pre-commit actually call it?
 *   5. Is `.env` covered by an ignore rule?
 *
 * REPOSITORIES ARE DISCOVERED, NEVER LISTED, following check-fleet-aidd-entries.ts: every
 * hardcoded inventory in this effort went stale within hours, and the repository a list forgets is
 * the one that leaks.
 *
 *   bun scripts/check-fleet-hook-wiring.ts [--root <dir>]
 *
 * Exit 1 if any repository has a hook that cannot run.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { argv, exit } from 'node:process';
import { parseArgs } from 'node:util';

const AIDD_ROOT = resolve(import.meta.dir, '..');

/** Hooks git executes directly. Anything else in .githooks is a body invoked via `bash <path>`. */
const EXECUTED = new Set([
	'commit-msg',
	'post-checkout',
	'pre-commit',
	'pre-push',
	'prepare-commit-msg',
]);

const git = (cwd: string, args: string[]): { ok: boolean; stdout: string } => {
	const p = Bun.spawnSync(['git', ...args], { cwd, windowsHide: true });
	return { ok: p.success, stdout: new TextDecoder().decode(p.stdout).trim() };
};

const ignored = (repo: string, path: string): boolean =>
	git(repo, ['check-ignore', '-q', '--no-index', path]).ok;

/**
 * Shell scripts a hook invokes, as repository-relative paths. The two spellings the fleet uses do
 * NOT resolve to the same place, so they cannot be conflated: `bash .githooks/x.sh` is relative to
 * the working-tree root, because that is git's cwd for every hook, and it stays correct even when
 * the hook itself was generated into .git/hooks by simple-git-hooks. `"$hooks_dir/x.sh"` is
 * relative to whichever directory the hook resolved for itself.
 */
const invokedScripts = (body: string, hooksRel: string): string[] => {
	const found = new Set<string>();
	for (const m of body.matchAll(/\.githooks\/([\w-]+\.sh)/g)) found.add(`.githooks/${m[1]!}`);
	for (const m of body.matchAll(/\$(?:\{)?(?:hooks_dir|dirname "\$0")(?:\})?\/([\w-]+\.sh)/g))
		found.add(`${hooksRel}/${m[1]!}`);
	return [...found];
};

export interface HookWiringOptions {
	root: string;
}

export function parseHookWiringArgs(args: string[]): HookWiringOptions {
	const { values } = parseArgs({ args, options: { root: { type: 'string' } }, strict: true });
	// parseArgs takes the token after `--root` as its value even when that token is itself a flag,
	// so a mistyped invocation would sweep a directory named after the flag, discover no
	// repositories, and report the fleet clean.
	if (values.root !== undefined && (values.root.trim() === '' || values.root.startsWith('-'))) {
		throw new Error('--root requires a directory path.');
	}
	return { root: values.root === undefined ? resolve(AIDD_ROOT, '..') : resolve(values.root) };
}

/** The five answers for one repository, plus whether it has any hook git would execute. */
function inspectRepo(repo: string): { problems: string[]; wired: boolean } {
	const problems: string[] = [];
	const name = repo.split(/[\\/]/).pop()!;
	const configured = git(repo, ['config', '--local', 'core.hooksPath']).stdout;

	// 1. A hooksPath naming nothing is the worst of both states: the repository reads as guarded and
	// runs no hook at all, because git looks only where the config points.
	if (configured !== '' && !existsSync(join(repo, configured))) {
		problems.push(
			`${name}: core.hooksPath is '${configured}' but that directory does not exist — no hook runs at all. Create it or unset the config.`,
		);
		return { problems, wired: false };
	}

	const hooksRel = configured === '' ? '.git/hooks' : configured;
	const hooksDir = join(repo, hooksRel);
	if (!existsSync(hooksDir)) return { problems, wired: false };

	const hooks = readdirSync(hooksDir).filter(
		(f) => EXECUTED.has(f) && statSync(join(hooksDir, f)).isFile(),
	);

	for (const hook of hooks) {
		const body = readFileSync(join(hooksDir, hook), 'utf8');

		// 2. A hook that calls a script the repository does not have fails every invocation rather
		// than guarding it, and a hook that fails every time gets uninstalled rather than fixed.
		for (const script of invokedScripts(body, hooksRel)) {
			if (!existsSync(join(repo, script)))
				problems.push(
					`${name}: ${hooksRel}/${hook} calls ${script}, which does not exist — every ${hook} would fail.`,
				);
		}

		// 3. The filesystem bit is not enough. These repos run core.fileMode=false, so git ignores
		// the on-disk mode and records 100644, and git will not execute a non-executable hook on
		// POSIX. A clone to Linux gets a silently disabled guard, which is worse than no guard
		// because the repository looks protected. Only tracked hooks can carry a mode; the ones
		// under .git/hooks are generated locally and are exempt.
		if (configured !== '') {
			const entry = git(repo, ['ls-files', '-s', `${configured}/${hook}`]).stdout;
			if (entry !== '' && !entry.startsWith('100755'))
				problems.push(
					`${name}: ${hooksRel}/${hook} is recorded ${entry.slice(0, 6)} in the index — a clone to POSIX would not execute it. Run: git update-index --chmod=+x ${configured}/${hook}`,
				);
		}
	}

	// 4. The guard's own file being present says nothing about whether anything calls it. Check the
	// hook git would actually run, which for a simple-git-hooks repository is under .git/hooks and
	// carries the call the tool generated from package.json.
	if (existsSync(join(repo, '.githooks', 'leak-guard.sh'))) {
		const live = join(repo, hooksRel, 'pre-commit');
		const calls =
			existsSync(live) &&
			invokedScripts(readFileSync(live, 'utf8'), hooksRel).some((s) =>
				s.endsWith('/leak-guard.sh'),
			);
		if (!calls)
			problems.push(
				`${name}: leak-guard.sh is present but no active pre-commit calls it — the guard is installed and dead.`,
			);
	}

	// 5. The guard catches a secret on its way into a commit; the ignore rule keeps it out of the
	// staged set in the first place. Neither substitutes for the other.
	if (!ignored(repo, '.env')) problems.push(`${name}: no ignore rule covers .env`);

	return { problems, wired: hooks.length > 0 };
}

export function runFleetHookWiring(options: HookWiringOptions): number {
	const repos = readdirSync(options.root, { withFileTypes: true })
		.filter((e) => e.isDirectory() && !e.name.endsWith('.old'))
		.map((e) => join(options.root, e.name))
		.filter((d) => existsSync(join(d, '.git')));

	const results = repos.map((repo) => inspectRepo(repo));
	const problems = results.flatMap((r) => r.problems);
	const wired = results.filter((r) => r.wired).length;

	console.log(`swept ${repos.length} repositories (${wired} with hooks wired)`);
	if (problems.length === 0) {
		console.log(
			'[OK] fleet hook wiring — every installed guard is reachable and every .env is ignored.',
		);
		return 0;
	}
	for (const p of problems) console.error(`  ${p}`);
	console.error(`\n[FAIL] fleet hook wiring: ${problems.length} problem(s).`);
	return 1;
}

if (import.meta.main) {
	let options: HookWiringOptions;
	try {
		options = parseHookWiringArgs(argv.slice(2));
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		console.error(`[FAIL] check-fleet-hook-wiring: ${message}`);
		console.error('Usage: bun scripts/check-fleet-hook-wiring.ts [--root <dir>]');
		exit(2);
	}
	exit(runFleetHookWiring(options));
}
