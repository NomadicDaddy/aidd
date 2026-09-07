import { isAbsolute, relative, resolve } from 'node:path';
import {
	isAbsolute as win32IsAbsolute,
	relative as win32Relative,
	resolve as win32Resolve,
} from 'node:path/win32';

// Git Bash and WSL spell Windows drives as POSIX paths (`/d/apps/x`, `/mnt/d/apps/x`). Without
// normalization those spellings of WORKSPACE paths resolve against the cwd drive and get
// wrongly rejected — observed as an agent unable to reference its own node_modules/.bin and
// building shims for hours. Only single-drive-letter forms are rewritten; everything else
// (e.g. /usr, /tmp) is left alone and still rejects on win32.
export function normalizePosixDrivePath(target: string, platform: NodeJS.Platform): string {
	if (platform !== 'win32') return target;
	const mnt = target.match(/^\/mnt\/([A-Za-z])(\/.*)?$/);
	if (mnt?.[1] !== undefined) return `${mnt[1]}:${mnt[2] ?? '/'}`;
	const drive = target.match(/^\/([A-Za-z])(\/.*)?$/);
	if (drive?.[1] !== undefined) return `${drive[1]}:${drive[2] ?? '/'}`;
	return target;
}

/**
 * True when a token contains a shell expansion, so its real value is only known at runtime.
 *
 * This is the one hole that turned the workspace edge into a suggestion: `cd "$AIDD_ROOT"` reads
 * to {@link isPathWithinWorkspaceRoot} as the *relative* segment `$AIDD_ROOT`, resolves happily
 * inside the workspace, and is then expanded by bash to wherever the variable actually points.
 * A `cd` destination is the one place a lexical filter cannot afford that, because every path
 * check after it is relative to the directory `cd` chose.
 *
 * Deliberately broad — any `$` or backtick, not a curated list of expansion forms. A literal `$`
 * in a directory name is rare; a spelling this misses is a silent escape. Other arguments are
 * expanded statically instead (`shell-policy-expansion.ts`), because a `cd` target changes what
 * every later check is relative to and so gets the stricter treatment.
 */
export function expandsAtRuntime(target: string): boolean {
	return /[$`]/.test(target);
}

export function isPathWithinWorkspaceRoot(
	target: string,
	root: string,
	platform: NodeJS.Platform = process.platform,
): boolean {
	if (target === '') return true;
	const normalized = normalizePosixDrivePath(target, platform);
	// A `$` that reaches here is literal: the containment sweep expands every reference the
	// command binds and denies the ones it cannot (see `shell-policy-expansion.ts`), so
	// `out_$i.txt` has already become `out_1.txt` and `$PWD/../x` has become `./../x`.
	const useWin32 = platform === 'win32';
	const isAbsoluteFn = useWin32 ? win32IsAbsolute : isAbsolute;
	const resolveFn = useWin32 ? win32Resolve : resolve;
	const relativeFn = useWin32 ? win32Relative : relative;
	const isAbs = isAbsoluteFn(normalized) || /^[A-Za-z]:[\\/]/.test(normalized);
	const resolvedTarget = isAbs ? resolveFn(normalized) : resolveFn(root, normalized);
	const rel = relativeFn(root, resolvedTarget);
	if (rel === '') return true;
	return !rel.startsWith('..') && !isAbsoluteFn(rel);
}
