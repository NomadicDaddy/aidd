/**
 * What an existing pre-commit hook is, before anything is written over it.
 *
 * Four states, not two:
 *
 *   absent   install one
 *   ours     one of the two current variants; keep it in sync
 *   foreign  no guard call at all; refuse rather than disable whatever it does
 *   chain    calls the guard, matches neither variant, and declares itself deliberate
 *
 * That last case is the one that needs a declaration. A hook calling the guard while matching
 * neither current variant is ambiguous: it is either a local chain — written by hand because the
 * repository has commit-time checks of its own that no contract name covers, which is exactly what
 * the foreign-hook refusal tells an operator to do — or a copy of one of our variants that has
 * since gone stale. Overwriting the first deletes those checks; leaving the second means the guard
 * reads as installed and stays generations behind, which is the failure the installer exists to
 * end. Content cannot separate them: spernakit-htmx's stale copy of the canonical hook and
 * wopr-decryptor's hand-written chain both call the guard and match neither variant.
 *
 * So a local chain declares itself with LOCAL_CHAIN. Undeclared, it is read as stale and refused
 * with both ways out named. Nothing is silently overwritten and nothing silently rots.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { AIDD_ROOT, GUARD_ONLY_SOURCE, HOOK, LOCAL_CHAIN, MARKER } from './contract.ts';

export type HookState =
	{ kind: 'absent' | 'chain' | 'ours' } | { kind: 'foreign' | 'stale'; reason: string };

const FOREIGN =
	`a ${HOOK} hook already exists and is not ours. Chain the guard into it by hand,\n` +
	`           as its first step, before any check that can be cached or skipped, then re-run:\n` +
	`             ${MARKER}\n` +
	`             ${LOCAL_CHAIN}\n` +
	`           Both lines verbatim — they are what marks the hook as a deliberate local chain on\n` +
	`           the next pass. The guard call is repo-root-relative because git runs hooks from the\n` +
	`           root of the working tree.`;

const STALE =
	`the ${HOOK} hook calls the guard but matches neither current variant, and does\n` +
	`           not declare itself a local chain. It is most likely a copy of ours that has gone stale.\n` +
	`           Either delete it and re-run to take the current variant, or, if its extra steps are\n` +
	`           deliberate, keep them and add this line to its header:\n` +
	`             ${LOCAL_CHAIN}`;

export const classifyHook = (hookPath: string): HookState => {
	if (!existsSync(hookPath)) return { kind: 'absent' };

	const body = readFileSync(hookPath, 'utf8');
	if (!body.includes(MARKER)) return { kind: 'foreign', reason: FOREIGN };

	const variants = [HOOK, GUARD_ONLY_SOURCE].map((f) =>
		readFileSync(join(AIDD_ROOT, '.githooks', f), 'utf8'),
	);
	if (variants.includes(body)) return { kind: 'ours' };

	return body.includes(LOCAL_CHAIN) ? { kind: 'chain' } : { kind: 'stale', reason: STALE };
};
