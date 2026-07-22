import { lstat, readlink, realpath } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve } from 'node:path';

import { mirrorExclusions } from './types.ts';

export function shouldCopyToPlanningMirror(source: string): boolean {
	return !mirrorExclusions.has(basename(source));
}

/**
 * Like `realpath` but falls back to the lexical resolution when the path does not
 * exist (e.g. the destination of a copy that has not been created yet).
 */
export async function realpathSafe(p: string): Promise<string> {
	try {
		return await realpath(p);
	} catch {
		return resolve(p);
	}
}

/**
 * Asserts that `target` resolves to a location inside `root`. Resolves symlinks and
 * `..` segments so a path bug or a malicious symlink cannot escape `root`. Handles the
 * case where `target` does not yet exist (it may be the destination of a copy).
 * Throws if the target resolves outside the root.
 */
export async function assertInsideRoot(root: string, target: string, label: string): Promise<void> {
	const resolvedRoot = resolve(root);
	const resolvedTarget = await realpathSafe(resolve(target));
	const rel = relative(resolvedRoot, resolvedTarget);
	if (rel.startsWith('..') || resolve(join(resolvedRoot, rel)) !== resolvedTarget) {
		throw new Error(
			`scratch-workspace safety violation: ${label} "${target}" resolves to "${resolvedTarget}" which is outside scratch root "${resolvedRoot}"`
		);
	}
}

/**
 * Creates an async filter for `cp` that:
 *  1. Excludes mirror-blacklisted directory basenames (node_modules, .git, etc.).
 *  2. Skips symlinks whose resolved target points OUTSIDE the source project root,
 *     so a symlink to $HOME or a sibling .git cannot be ingested into the planning mirror.
 * Symlinks whose target resolves inside the project are copied as-is (dereference:false).
 */
export function createMirrorCopyFilter(sourceProjectDir: string) {
	const resolvedSource = resolve(sourceProjectDir);
	return async (src: string, _dest: string): Promise<boolean> => {
		if (!shouldCopyToPlanningMirror(src)) return false;
		let statResult;
		try {
			statResult = await lstat(src);
		} catch {
			return false;
		}
		if (!statResult.isSymbolicLink()) return true;
		// Resolve the symlink target and check containment.
		let target: string;
		try {
			const linkTarget = await readlink(src);
			target = resolve(dirname(src), linkTarget);
		} catch {
			return false;
		}
		const resolvedTarget = await realpathSafe(target);
		const rel = relative(resolvedSource, resolvedTarget);
		return !(rel.startsWith('..') || resolve(join(resolvedSource, rel)) !== resolvedTarget);
	};
}
