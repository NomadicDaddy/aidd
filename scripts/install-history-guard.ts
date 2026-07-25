#!/usr/bin/env bun
/**
 * install-history-guard.ts
 *
 * Installs the pre-push .aidd history guard into EVERY repository with a .aidd directory — managed
 * ones included.
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
 *   bun scripts/install-history-guard.ts [--dry-run] [--root <dir>]
 */
import { chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { argv, exit } from 'node:process';

const GUARD = 'aidd-history-guard.sh';
const HOOK = 'pre-push';
const MARKER = 'aidd history guard';

const AIDD_ROOT = resolve(import.meta.dir, '..');
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

const repos = readdirSync(FLEET_ROOT, { withFileTypes: true })
	.filter((e) => e.isDirectory() && !e.name.endsWith('.old'))
	.map((e) => join(FLEET_ROOT, e.name))
	.filter((d) => existsSync(join(d, '.git')) && existsSync(join(d, '.aidd')));

let installed = 0;
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
				`  REFUSED ${name}: a pre-push hook already exists and is not ours. Chain the guard into it by hand:\n` +
					`           bash "$(dirname "$0")/${GUARD}" "\${1:-origin}"`,
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

	if (dryRun) {
		console.log(`  would install: ${name}`);
		skipped++;
		continue;
	}

	mkdirSync(hooksDir, { recursive: true });
	copyFileSync(join(AIDD_ROOT, '.githooks', GUARD), join(hooksDir, GUARD));
	copyFileSync(join(AIDD_ROOT, '.githooks', HOOK), hookPath);

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
	// The guard body is invoked via `bash <path>`, so it needs no exec bit — matching the existing
	// leak-guard.sh convention (100644).
	sh(repo, ['add', `.githooks/${GUARD}`]);

	sh(repo, ['config', 'core.hooksPath', '.githooks']);
	console.log(
		`  installed: ${name}${hasPushRemote(repo) ? '  (armed — has a push remote)' : '  (dormant — no remote yet)'}`,
	);
	installed++;
}

const armed = repos.filter(hasPushRemote).length;
console.log(
	`\nhistory guard — ${installed} installed, ${skipped} pending (dry run), ${refused} refused, across ${repos.length} repositories ` +
		`(${armed} armed, ${repos.length - armed} dormant until a remote is added).`,
);
exit(refused > 0 ? 1 : 0);
