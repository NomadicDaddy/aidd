#!/usr/bin/env bun
/**
 * check-hook-parity.ts
 *
 * Enforces: `scaffolding/.githooks/` is a byte-identical subset of `.githooks/`.
 *
 * The repository has two copies of the same hook files and two different readers. The fleet syncs
 * (`sync-shared-core.ts`, `install-history-guard.ts`, `install-leak-guard.ts`) copy outward from
 * `.githooks/`, while `ensureHistoryGuard` installs from `scaffolding/.githooks/` — because the
 * scaffold is what ships in the standalone build and the repository root is not. Nothing made the
 * two agree.
 *
 * That gap already fired. On 2026-08-03 a fix to `.githooks/screenshot-guard.sh` landed in the
 * repository copy alone; `scaffolding/.githooks/screenshot-guard.sh` kept the pre-fix bytes, and
 * every subsequent `ensureHistoryGuard` run copied the stale file back over the fixed one and
 * staged it. The revert reached the index of the repository that owns the file, one command short
 * of being pushed to the 32 repositories that sync from it.
 *
 * Two assertions, in the direction the failure ran:
 *   1. Every file in `scaffolding/.githooks/` exists in `.githooks/` with identical bytes.
 *   2. Every file `ensureHistoryGuard` installs exists in `scaffolding/.githooks/` — a hook copied
 *      without a guard it sources fails on first run under `set -euo pipefail`.
 *
 * The subset is intentionally one-directional. `.githooks/` legitimately holds files the scaffold
 * must not carry: the full `pre-commit` names tasks a scaffolded package.json does not define, and
 * `leak-guard-setup.sh` is invoked from a `prepare` script a scaffolded package.json does not have.
 * A missing-from-scaffold file is only a failure when assertion 2 names it.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { exit } from 'node:process';

import { GUARD_ONLY_FILES, GUARD_ONLY_SOURCE } from './lib/leak-guard/contract.ts';
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
