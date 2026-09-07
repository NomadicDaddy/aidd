import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path/win32';

export interface BashResolverDeps {
	env: Record<string, string | undefined>;
	existsSync: (path: string) => boolean;
	platform: NodeJS.Platform;
	which: (command: string) => null | string;
}

export type BashResolution = { error: string } | { path: string };

// Only the single override variable is read — never the full process env (the env-spread
// gate enforces allowlisted child environments; this resolver spawns nothing itself).
const defaultDeps: BashResolverDeps = {
	env: { AIDD_BASH: process.env.AIDD_BASH },
	existsSync,
	platform: process.platform,
	which: (command) => Bun.which(command),
};

const missingBashError =
	'no usable bash found on Windows: the PATH bash (if any) is the WSL shim, which cannot run ' +
	'Windows toolchains (bun.exe/tsc.exe fail with "Exec format error"). Install Git for Windows ' +
	'or point AIDD_BASH at a bash.exe.';

function isSystem32Path(path: string): boolean {
	return /\\(?:windows|winnt)\\system32\\/i.test(path);
}

/**
 * Resolve the bash executable the native agent's shell tool spawns.
 *
 * On win32 a bare `Bun.spawn(['bash', ...])` takes whatever bash is first on PATH — often the
 * WSL shim in System32, whose Linux environment cannot execute the project's Windows `.exe`
 * toolchain (observed as hours of "Exec format error" flailing before wall-clock death). So the
 * resolution is deterministic: AIDD_BASH override → Git Bash derived from the git on PATH →
 * default Git-for-Windows install locations. A System32 bash is never returned.
 */
export function resolveBashExecutable(deps: BashResolverDeps = defaultDeps): BashResolution {
	if (deps.platform !== 'win32') return { path: 'bash' };

	const override = deps.env.AIDD_BASH;
	if (override !== undefined && override.trim() !== '') {
		if (!deps.existsSync(override)) {
			return { error: `AIDD_BASH is set to '${override}' but no file exists there.` };
		}
		if (isSystem32Path(override)) {
			return {
				error: `AIDD_BASH points at the WSL bash shim ('${override}'), which cannot run Windows toolchains. Point it at Git Bash (e.g. C:\\Program Files\\Git\\bin\\bash.exe).`,
			};
		}
		return { path: override };
	}

	const candidates: string[] = [];
	const git = deps.which('git');
	if (git) {
		const gitRoot = dirname(dirname(git));
		candidates.push(join(gitRoot, 'bin', 'bash.exe'), join(gitRoot, 'usr', 'bin', 'bash.exe'));
	}
	candidates.push(
		'C:\\Program Files\\Git\\bin\\bash.exe',
		'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
	);
	const found = candidates.find((path) => !isSystem32Path(path) && deps.existsSync(path));
	if (found !== undefined) return { path: found };
	return { error: missingBashError };
}

export interface GitBashEnvDeps {
	existsSync: (path: string) => boolean;
	platform: NodeJS.Platform;
}

const defaultEnvDeps: GitBashEnvDeps = {
	existsSync,
	platform: process.platform,
};

/**
 * Directories Git Bash needs on PATH to run its bundled coreutils (cat, cp, sed, …).
 * `bash.exe -c` starts a non-login shell that never self-prepends /usr/bin, and the Git
 * installer's default Windows PATH carries only Git\cmd — so without these directories every
 * coreutil in a spawned tool shell resolves to "command not found" (exit 127). Ordered like an
 * interactive Git Bash: mingw64\bin, usr\bin, bin.
 */
export function gitBashPathDirs(bashPath: string, deps: GitBashEnvDeps = defaultEnvDeps): string[] {
	if (deps.platform !== 'win32') return [];
	const lowered = bashPath.toLowerCase();
	const suffix = ['\\usr\\bin\\bash.exe', '\\bin\\bash.exe'].find((s) => lowered.endsWith(s));
	if (suffix === undefined) return [];
	const gitRoot = bashPath.slice(0, bashPath.length - suffix.length);
	return [
		join(gitRoot, 'mingw64', 'bin'),
		join(gitRoot, 'usr', 'bin'),
		join(gitRoot, 'bin'),
	].filter((dir) => deps.existsSync(dir));
}

/**
 * Prepend the Git Bash toolchain directories to every PATH-shaped key of a subprocess env.
 * Directories already present (case-insensitive) are not repeated, so an aidd process that was
 * itself launched from Git Bash passes its PATH through unchanged.
 */
export function augmentEnvPathForGitBash(
	bashPath: string,
	env: Record<string, string>,
	deps: GitBashEnvDeps = defaultEnvDeps,
): Record<string, string> {
	const dirs = gitBashPathDirs(bashPath, deps);
	if (dirs.length === 0) return env;
	const augmented = { ...env };
	const pathKeys = Object.keys(augmented).filter((key) => key.toLowerCase() === 'path');
	if (pathKeys.length === 0) {
		augmented.PATH = dirs.join(';');
		return augmented;
	}
	for (const key of pathKeys) {
		const current = augmented[key] ?? '';
		const present = new Set(
			current
				.split(';')
				.map((segment) => segment.trim().toLowerCase())
				.filter((segment) => segment !== ''),
		);
		const missing = dirs.filter((dir) => !present.has(dir.toLowerCase()));
		if (missing.length === 0) continue;
		augmented[key] = `${missing.join(';')};${current}`;
	}
	return augmented;
}

let memoized: BashResolution | undefined;

/** Process-wide memoized resolution (the install location does not move mid-run). */
export function resolvedBash(): BashResolution {
	memoized ??= resolveBashExecutable();
	return memoized;
}
