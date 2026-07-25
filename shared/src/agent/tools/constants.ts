import { existsSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';

export const maxToolResultChars = 100_000;
export const maxCommandOutputChars = 50_000;
export const excludedSearchDirs = [
	'node_modules',
	'.git',
	'dist',
	'build',
	'.next',
	'.aidd/iterations',
	'data',
	'coverage',
	'.cache',
	'vendor',
];

/**
 * Resolve the workspace root with symlink awareness. The root itself may be a
 * symlink (e.g. a temp dir on CI), so we realpath it once for consistent
 * comparison against resolved paths.
 */
function resolveRealRoot(cwd: string): string {
	const root = resolve(cwd);
	try {
		return realpathSync(root);
	} catch {
		return root;
	}
}

/**
 * After lexical resolution confirms a path stays within the workspace,
 * verify that no symlink component escapes. Walk existing ancestors with
 * realpathSync; the final path component may not exist yet (write_file to
 * a new file), so only existing ancestors are checked.
 */
function verifyRealPathWithinRoot(lexicalPath: string, realRoot: string): null | string {
	// Walk upward from the resolved path, realpathSync-ing each existing
	// ancestor. The leaf (the file itself) may not exist yet.
	let current = lexicalPath;
	while (true) {
		if (existsSync(current)) {
			try {
				const realCurrent = realpathSync(current);
				const rel = relative(realRoot, realCurrent);
				if (rel !== '' && (rel.startsWith('..') || isAbsolute(rel))) {
					return `ERROR: Path escapes working directory via symlink: ${realCurrent}`;
				}
			} catch {
				// If realpathSync fails on an existing path, deny access.
				return `ERROR: Could not resolve real path: ${current}`;
			}
			break;
		}
		const parent = dirname(current);
		if (parent === current) break; // reached filesystem root
		current = parent;
	}
	return null;
}

export function resolveWorkspacePath(
	userPath: unknown,
	cwd: string,
): { error: string } | { path: string } {
	if (typeof userPath !== 'string' || userPath.trim() === '') {
		return { error: 'ERROR: path must be a non-empty string' };
	}
	if (isAbsolute(userPath) || /^[A-Za-z]:/.test(userPath)) {
		return { error: `ERROR: Absolute paths are not allowed: ${userPath}` };
	}
	const realRoot = resolveRealRoot(cwd);
	const target = resolve(realRoot, userPath);
	const rel = relative(realRoot, target);
	if (rel.startsWith('..') || isAbsolute(rel)) {
		return { error: `ERROR: Path escapes working directory: ${userPath}` };
	}
	// Symlink escape check: verify no symlink in the resolved path chain
	// points outside the workspace root.
	const symlinkError = verifyRealPathWithinRoot(target, realRoot);
	if (symlinkError) return { error: symlinkError };
	return { path: target };
}

export function truncate(result: string, maxChars: number, label: string): string {
	return result.length > maxChars ? `${result.substring(0, maxChars)}\n... (${label})` : result;
}
