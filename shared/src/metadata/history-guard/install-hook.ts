import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

// The mechanics of putting one hook into a project: what a hook is made of (HookSpec), how git
// is invoked, and the copy-then-stage sequence itself. Split out of ../history-guard.ts, which
// keeps the policy — which repositories may be guarded at all, and which hooks they get.

interface HookSpec {
	/** Bodies the wrapper sources; each must be delivered with it or the hook fails on first run. */
	guards: string[];
	/** Name the hook takes in `.githooks/`, which is what `core.hooksPath` makes git run. */
	hook: string;
	/**
	 * Deliver this hook only where none exists yet, instead of overwriting one of ours in place.
	 *
	 * Set for the commit hook and deliberately not for the push hook, because their source and
	 * destination relate differently. `pre-push` installs from the scaffold copy of the SAME file, so
	 * overwriting one of ours is how a guard fix reaches a scaffolded project. `pre-commit` installs
	 * from `pre-commit-leak-guard-only` — a deliberately LESSER variant of the file it lands on — so
	 * the same overwrite is a downgrade.
	 *
	 * `marker` cannot tell the two variants apart: it is `bash .githooks/leak-guard.sh`, and both
	 * carry that line because both run the same guard first. So from 2026-08-09 every aidd run
	 * replaced the full `pre-commit` with the guard-only one in each `.aidd`-carrying project it
	 * touched and staged the result — dropping `smoke:qc:fast` and `check:licenses` from every
	 * subsequent commit while the hook still read as installed. `aidd` and `podex` were both caught
	 * that way on 2026-08-09; `podex` by `check:shared-core`, `aidd` only indirectly, since a group's
	 * owner is excluded from its own target discovery.
	 *
	 * An existing hook is therefore one of three things, and none of them wants this file: a
	 * stranger's (already refused above), this exact file (nothing to do), or the fuller variant the
	 * fleet sync installed because the repository satisfies its script-name contract. Upgrades in
	 * that direction belong to `sync-shared-core.ts`, which reads the target's `package.json` and can
	 * tell which variant the repository has earned. This installer cannot: the scaffold ships only
	 * the guard-only file.
	 */
	keepExisting?: true;
	/** Text that identifies the hook as ours, so a foreign one is refused rather than replaced. */
	marker: string;
	/** Name in `scaffolding/.githooks/`, which differs from `hook` for the commit guard. */
	sourceFile: string;
}

export const git = async (
	cwd: string,
	args: string[],
): Promise<{ ok: boolean; stdout: string }> => {
	try {
		const p = Bun.spawn(['git', '-C', cwd, ...args], {
			stderr: 'pipe',
			stdout: 'pipe',
			windowsHide: true,
		});
		const [stdout, code] = await Promise.all([new Response(p.stdout).text(), p.exited]);
		return { ok: code === 0, stdout: stdout.trim() };
	} catch {
		return { ok: false, stdout: '' };
	}
};

/**
 * Copy one wrapper and the guards it sources into `.githooks`, then stage all of them.
 *
 * Shared by both hooks because the sequence is not obvious and getting half of it right is what
 * ships a broken repository: the wrapper and its guards are one unit, the index mode is the only
 * part that survives a clone, and a wrapper staged without its guards fails on a fresh checkout.
 */
export async function installHook(
	projectDir: string,
	source: string,
	hooksDir: string,
	spec: HookSpec,
): Promise<'foreign-hook' | 'installed' | 'kept' | 'no-source' | 'skipped'> {
	const hookSource = join(source, spec.sourceFile);
	if (!(await Bun.file(hookSource).exists())) return 'no-source';

	// core.hooksPath allows exactly one hook of each name. Overwriting one we did not write would
	// silently disable whatever it was doing, so refuse and leave it to a human to chain.
	const hookPath = join(hooksDir, spec.hook);
	let existing: null | string = null;
	try {
		existing = await readFile(hookPath, 'utf8');
	} catch {
		/* No hook yet — the normal case. */
	}
	if (existing !== null && !existing.includes(spec.marker)) return 'foreign-hook';
	const keep = existing !== null && spec.keepExisting === true;

	// Guards are still delivered when the hook is kept, but only the ones that are ABSENT: a
	// repository missing a body its hook sources fails every commit, so healing that is worth doing,
	// while rewriting a guard already on disk is how a stale scaffold copy reverted a fixed
	// screenshot-guard.sh on 2026-08-03. Updating guard bodies belongs to the fleet sync.
	const delivered: string[] = [];
	try {
		await mkdir(hooksDir, { recursive: true });
		for (const guard of spec.guards) {
			const guardSource = join(source, guard);
			// A guard the current scaffolding does not ship is not an error: only guards the wrapper
			// actually sources are present, and copying a missing one would fail the whole install.
			if (!(await Bun.file(guardSource).exists())) continue;
			const guardPath = join(hooksDir, guard);
			if (keep && (await Bun.file(guardPath).exists())) continue;
			await copyFile(guardSource, guardPath);
			delivered.push(guard);
		}
		if (!keep) await copyFile(hookSource, hookPath);
	} catch {
		return 'skipped';
	}

	// The index mode is the only part that survives a clone: under core.fileMode=false (Windows) git
	// ignores the filesystem exec bit and records 100644, and POSIX git will not run a hook that is
	// not executable — yielding a repository that looks guarded and is not.
	//
	// Skipped for a kept hook, and that is the point of keeping it: `update-index --add` on a file
	// this run did not write would sweep somebody else's unstaged edit into their next commit. A hook
	// already ours was staged by whichever installer put it there, and a mode recorded 100644 is what
	// `check:fleet-hook-wiring` exists to catch.
	const stagedHook = keep
		? { ok: true }
		: await git(projectDir, ['update-index', '--add', '--chmod=+x', `.githooks/${spec.hook}`]);
	// Stage every guard body too. Staging only the wrapper lets a routine `git commit` publish a hook
	// that sources a file which is not in the repository — so a fresh clone runs a hook that
	// immediately fails on a missing script. The wrapper and the guards it sources are one unit.
	let stagedGuards = true;
	for (const guard of delivered) {
		const staged = await git(projectDir, ['add', `.githooks/${guard}`]);
		stagedGuards &&= staged.ok;
	}

	if (!stagedHook.ok || !stagedGuards) return 'skipped';
	return keep ? 'kept' : 'installed';
}
