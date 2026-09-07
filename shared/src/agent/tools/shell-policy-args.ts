import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolve as win32Resolve } from 'node:path/win32';

import { resolveRealRoot, verifyRealPathWithinRoot } from './constants.ts';
import { expandShellTokens } from './shell-policy-expansion.ts';
import { isPathWithinWorkspaceRoot, normalizePosixDrivePath } from './shell-policy-paths.ts';
import { tokenizeShell } from './shell-policy-tokens.ts';

/**
 * General argument containment for the bash workspace policy.
 *
 * The named checks in `shell-policy.ts` (absolute tokens, `cd`, redirects, `cp`/`mv`/`tee`
 * destinations) each bound one syntactic position. Everything else reached the shell unchecked:
 * `cat ../outside.txt`, `cp ../outside.txt inside.txt`, `rm ../outside.txt` and
 * `cat "/etc/passwd"` (quoted, so the absolute sweep — which blanks quoted spans — never saw it)
 * all passed policy. This module closes that by resolving *every* argument against the workspace
 * root, so containment is a property of the command rather than of the handful of positions
 * someone remembered to enumerate. The arguments it resolves are the statically expanded ones
 * (see `shell-policy-expansion.ts`), so a value bash assembles at runtime is judged as the path it
 * becomes rather than as the spelling that produced it.
 */

/**
 * True when the command contains command substitution — `$(...)`, backticks, or the process
 * substitutions `<(...)`/`>(...)` — whose value is produced by another command at runtime and
 * therefore cannot be bounded lexically. This is the generic form of the `cd "$(...)"` hole:
 * `cat $(printf '%s' /etc/passwd)` carries no path a static filter can see.
 *
 * Arithmetic expansion `$((...))` is exempt: it evaluates to a number, not a path. A nested
 * substitution inside one — `$(( $(id -u) + 1 ))` — still matches at the inner `$(`.
 */
export function usesCommandSubstitution(command: string): boolean {
	return /\$\((?!\()|`|[<>]\(/.test(command);
}

/**
 * Resolve every argument of the command against the workspace root and reject any that lands
 * outside it, lexically (`../`, absolute) or after realpath resolution (symlink escape).
 *
 * `root` is the lexical workspace root used by the sibling checks; the realpath pass compares
 * against the realpath of that root, because the root itself is frequently a symlink (temp dirs
 * on CI and macOS) and a realpath-vs-lexical comparison would then reject everything.
 */
export function checkArgumentContainment(command: string, root: string): null | string {
	const realRoot = resolveRealRoot(root);
	// The realpath walk climbs ancestors until it finds one that exists. If the root itself does
	// not exist on disk (unit tests use notional roots like `/projects/app`) the walk sails past
	// it and reports the root's own parent as an escape, failing every command. Symlink
	// resolution is meaningless without a real root, so skip that half of the check instead.
	const canResolveLinks = existsSync(realRoot);
	// Arguments are judged after static expansion (`shell-policy-expansion.ts`): a token spelled
	// `$a$a` or `$PWD/../x` is checked as the `..` that bash will actually hand to the program.
	const expansion = expandShellTokens(tokenizeShell(command));
	if ('error' in expansion) return expansion.error;
	for (const token of expansion.tokens) {
		for (const candidate of pathCandidates(token)) {
			const violation = checkCandidate(candidate, root, realRoot, canResolveLinks);
			if (violation !== null) return violation;
		}
	}
	return null;
}

/**
 * The path-bearing parts of one token.
 *
 * A bare flag (`-la`, `--oneline`, `-5`, `-`) is never a path, so it is dropped — that exemption
 * is what keeps `git log --oneline -5` and `ls -la` working. A token with an `=` contributes its
 * right-hand side as well as itself, so `dd of=../out`, `--output=../out` and `VAR=../out` are
 * all inspected; without it the `..` sits behind a prefix and resolves to a harmless literal
 * segment.
 */
function pathCandidates(token: string): string[] {
	if (token === '') return [];
	const equals = token.indexOf('=');
	if (token.startsWith('-')) return equals > 0 ? [token.slice(equals + 1)] : [];
	return equals > 0 ? [token, token.slice(equals + 1)] : [token];
}

function checkCandidate(
	candidate: string,
	root: string,
	realRoot: string,
	canResolveLinks: boolean,
): null | string {
	if (candidate === '' || candidate === '.' || candidate === './') return null;
	if (!isPathWithinWorkspaceRoot(candidate, root)) {
		return `ERROR: bash command references path outside workspace (${root}): ${candidate}`;
	}
	return canResolveLinks ? checkSymlinkContainment(candidate, realRoot) : null;
}

/**
 * Lexical containment says nothing about symlinks: `cat escape_link/config.json` resolves inside
 * the root and is then followed by the kernel to wherever the link points. This reuses the exact
 * realpath walk the structured filesystem tools use (`verifyRealPathWithinRoot`), so `bash` and
 * `read_file` enforce one boundary instead of two that drift apart.
 *
 * Only existing components are resolved, so a not-yet-created output file is not rejected for
 * being absent. The cost is one `existsSync` per ancestor and only until an existing one is
 * found, which for an in-workspace path is almost always the leaf or its parent.
 */
function checkSymlinkContainment(candidate: string, realRoot: string): null | string {
	const normalized = normalizePosixDrivePath(candidate, process.platform);
	const resolveFn = process.platform === 'win32' ? win32Resolve : resolve;
	let lexical: string;
	try {
		lexical = resolveFn(realRoot, normalized);
	} catch {
		// A token that cannot even be resolved as a path is not one; leave it to the other checks.
		return null;
	}
	const detail = verifyRealPathWithinRoot(lexical, realRoot);
	if (detail === null) return null;
	const reason = detail.replace(/^ERROR: /, '');
	return `ERROR: bash command references path outside workspace via a symlink (${realRoot}): ${candidate} (${reason})`;
}
