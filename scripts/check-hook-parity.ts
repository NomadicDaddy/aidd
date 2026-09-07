#!/usr/bin/env bun
/**
 * check-hook-parity.ts
 *
 * Enforces: `scaffolding/.githooks/` is a byte-identical subset of `.githooks/`.
 *
 * The repository has two copies of the same hook files and two different readers. The fleet syncs
 * (`sync-shared-core.ts`, `install-history-guard.ts`, `install-leak-guard.ts`) copy outward from
 * `.githooks/`, while `ensureHistoryGuard` installs from `scaffolding/.githooks/` — because the
 * scaffold is what a fresh project is built from and the repository root is not. Nothing made the
 * two agree.
 *
 * That gap already fired. On 2026-08-03 a fix to `.githooks/screenshot-guard.sh` landed in the
 * repository copy alone; `scaffolding/.githooks/screenshot-guard.sh` kept the pre-fix bytes, and
 * every subsequent `ensureHistoryGuard` run copied the stale file back over the fixed one and
 * staged it. The revert reached the index of the repository that owns the file, one command short
 * of being pushed to the 32 repositories that sync from it.
 *
 * Three assertions, in the direction the failure ran:
 *   1. Every file in `scaffolding/.githooks/` exists in `.githooks/` with identical bytes.
 *   2. Every file `ensureHistoryGuard` installs exists in `scaffolding/.githooks/` — a hook copied
 *      without a guard it sources fails on first run under `set -euo pipefail`.
 *   3. A hook the scaffold delivers under a DIFFERENT name has not collapsed into it — see below.
 *
 * The subset is intentionally one-directional. `.githooks/` legitimately holds files the scaffold
 * must not carry: the full `pre-commit` names tasks a scaffolded package.json does not define, and
 * `leak-guard-setup.sh` is invoked from a `prepare` script a scaffolded package.json does not have.
 * A missing-from-scaffold file is only a failure when assertion 2 names it.
 *
 * Assertions 1 and 2 both compare BY FILENAME, which is what let the third failure through. One
 * scaffold file does not keep its name on install: `pre-commit-leak-guard-only` lands as
 * `pre-commit`. From 2026-08-09 `ensureHistoryGuard` wrote it over the full hook in every
 * `.aidd`-carrying project — including this one — because the only test guarding that copy is a
 * marker both variants carry. Name-for-name the two directories still agreed perfectly, so this gate
 * passed while `.githooks/pre-commit` and `.githooks/pre-commit-leak-guard-only` had become the same
 * file. The collision is on the DESTINATION name, and nothing looked at destinations.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { exit } from 'node:process';

import {
	HOOK as COMMIT_HOOK,
	GUARD_ONLY_FILES,
	GUARD_ONLY_SOURCE,
} from './lib/leak-guard/contract.ts';
import { GUARDS, HOOK } from './lib/push-guards/contract.ts';

const ROOT = resolve(import.meta.dir, '..');
const OWNER = resolve(ROOT, '.githooks');
const SCAFFOLD = resolve(ROOT, 'scaffolding', '.githooks');

/**
 * Exactly what ensureHistoryGuard copies out of the scaffold: both hooks and the guards they source.
 *
 * Taken from the two contract modules rather than listed here, so adding a guard to a hook adds it
 * to this gate in the same change. A restated list would go stale the first time one of them grew.
 */
const INSTALLED = [HOOK, ...GUARDS, GUARD_ONLY_SOURCE, ...GUARD_ONLY_FILES];

/**
 * The installs where the delivered file does not keep its name, source -> destination.
 *
 * `pre-push` installs as itself and needs no entry: the scaffold copy and the owner copy are the
 * same file, so assertion 1 already covers it. This list is only for the renaming installs, where
 * a source and its destination are two different files that must stay two different files.
 */
const RENAMED_ON_INSTALL = [{ destination: COMMIT_HOOK, source: GUARD_ONLY_SOURCE }];

const read = (dir: string, name: string): Buffer | null => {
	try {
		return readFileSync(join(dir, name));
	} catch {
		return null;
	}
};

export function findHookParityProblems(ownerDir: string, scaffoldDir: string): string[] {
	const problems: string[] = [];

	let scaffoldFiles: string[];
	try {
		scaffoldFiles = readdirSync(scaffoldDir)
			.filter((f) => statSync(join(scaffoldDir, f)).isFile())
			.sort();
	} catch {
		return [`${scaffoldDir} — directory is missing. The scaffold ships no hooks at all.`];
	}

	for (const name of scaffoldFiles) {
		const owner = read(ownerDir, name);
		if (owner === null) {
			problems.push(
				`scaffolding/.githooks/${name} — has no counterpart in .githooks/. The scaffold copy has no owner, so no sync will ever correct it.`,
			);
			continue;
		}
		// Byte comparison, not a line diff: these are shell scripts installed with an index mode, and
		// a lone line-ending difference is a real divergence between what two installers deliver.
		if (!owner.equals(read(scaffoldDir, name)!)) {
			problems.push(
				`scaffolding/.githooks/${name} — differs from .githooks/${name}. Copy the owner's version over the scaffold's; a change to one half reaches only the installer that reads that half.`,
			);
		}
	}

	const present = new Set(scaffoldFiles);
	for (const name of INSTALLED) {
		if (!present.has(name)) {
			problems.push(
				`scaffolding/.githooks/${name} — missing, but ensureHistoryGuard installs it. Under \`set -euo pipefail\` a hook whose guard was never delivered fails every run.`,
			);
		}
	}

	for (const { destination, source } of RENAMED_ON_INSTALL) {
		const installed = read(ownerDir, destination);
		// Nothing installed under that name yet, so there is nothing to have overwritten. Whether the
		// destination ought to exist is check:fleet-hook-wiring's question, not this gate's.
		if (installed === null) continue;
		const delivered = read(ownerDir, source);
		if (delivered !== null && installed.equals(delivered)) {
			problems.push(
				`.githooks/${destination} — byte-identical to .githooks/${source}, which ensureHistoryGuard installs over it. The richer hook has been overwritten by the lesser one; restore ${destination} from git history. The marker both variants carry cannot tell them apart, so nothing else will notice.`,
			);
		}
	}

	return problems;
}

export function runHookParity(): number {
	const problems = findHookParityProblems(OWNER, SCAFFOLD);

	if (problems.length > 0) {
		console.error('[FAIL] The scaffold hooks and the repository hooks disagree:\n');
		for (const p of problems) console.error(`  - ${p}`);
		console.error(
			`\n${problems.length} problem(s). shared/src/metadata/history-guard.ts installs from the scaffold; every fleet sync copies from .githooks/.`,
		);
		return 1;
	}

	const count = readdirSync(SCAFFOLD).filter((f) => statSync(join(SCAFFOLD, f)).isFile()).length;
	console.log(
		`[OK] check:hook-parity — ${count} scaffold hook file(s) match .githooks/, ${INSTALLED.length} installed file(s) present.`,
	);
	return 0;
}

if (import.meta.main) exit(runHookParity());
