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

export function isPathWithinWorkspaceRoot(
	target: string,
	root: string,
	platform: NodeJS.Platform = process.platform,
): boolean {
	if (target === '') return true;
	const normalized = normalizePosixDrivePath(target, platform);
	// A `$VAR` is treated as a literal path segment here (home/env expansions that could
	// escape are already denied by HOME_REFERENCE_PATTERN): a relative token like
	// `out_$i.txt` resolves inside the workspace, while `/abs/$x` or `../$x` does not.
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
