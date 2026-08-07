/** Git and manifest reads for the leak-guard installer. Nothing here writes to a repository. */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Trimmed stdout, or '' when git fails — every caller treats failure and absence the same way. */
export const sh = (cwd: string, args: string[]): string => {
	const p = Bun.spawnSync(['git', ...args], { cwd, windowsHide: true });
	return p.success ? new TextDecoder().decode(p.stdout).trim() : '';
};

export type Scripts = Record<string, string>;

/** `undefined` means no package.json at all, which is what selects the guard-only hook. */
export const readScripts = (repo: string): Scripts | undefined => {
	const manifest = join(repo, 'package.json');
	if (!existsSync(manifest)) return undefined;
	try {
		const parsed: unknown = JSON.parse(readFileSync(manifest, 'utf8'));
		const scripts =
			typeof parsed === 'object' && parsed !== null
				? (parsed as { scripts?: unknown }).scripts
				: undefined;
		return typeof scripts === 'object' && scripts !== null ? (scripts as Scripts) : {};
	} catch {
		// An unparseable manifest is not a reason to skip the repository, only a reason not to
		// promise it the full hook.
		return {};
	}
};

/**
 * Discovery, not a list — a hardcoded roster goes stale silently, and the repository it forgets is
 * the one that leaks. `only` narrows the sweep for ordering, and reports names that matched nothing
 * rather than passing over a typo in silence.
 */
export const discoverRepos = (fleetRoot: string, only?: Set<string>): string[] => {
	const repos = readdirSync(fleetRoot, { withFileTypes: true })
		.filter((e) => e.isDirectory() && !e.name.endsWith('.old'))
		.filter((e) => only === undefined || only.has(e.name))
		.map((e) => join(fleetRoot, e.name))
		.filter((d) => existsSync(join(d, '.git')));

	if (only !== undefined) {
		const found = new Set(repos.map((r) => repoName(r)));
		for (const name of only) {
			if (!found.has(name))
				console.error(`  UNKNOWN ${name}: no git repository under ${fleetRoot}`);
		}
	}
	return repos;
};

export const repoName = (repo: string): string => repo.split(/[\\/]/).pop() ?? repo;
