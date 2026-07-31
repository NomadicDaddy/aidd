/**
 * Filesystem roots a skill body is allowed to name.
 *
 * Skill prose is authored against a machine layout only aidd knows — `<aidd-root>/skills/...`,
 * `<applications-root>/AGENTS.md`, `<spernakit-root>/docs/...` — and nothing ever substituted
 * those tokens. Agents received them literally and had to guess, which is how a run ends up
 * spending turns on `which aidd-tools`, `ls /d/applications/aidd/cli/`, and `cd` probes before
 * concluding the path was never knowable. Same class of bug the `<app-url>` placeholder had, and
 * the same fix: resolve it at compile time, and say so when it cannot be resolved.
 */
export interface SkillRootPaths {
	/** The aidd installation directory the CLI is running from. */
	aidd?: string | undefined;
	/** Parent directory holding the managed application checkouts. */
	applications?: string | undefined;
	/** The project directory this run operates on — the agent's working directory. */
	project?: string | undefined;
	/** A configured spernakit checkout, when the machine has one. */
	spernakit?: string | undefined;
}

const rootPlaceholders = [
	['<aidd-root>', 'aidd'],
	['<applications-root>', 'applications'],
	['<spernakit-root>', 'spernakit'],
] as const satisfies readonly (readonly [string, keyof SkillRootPaths])[];

/**
 * Substitute the root placeholders that resolve on this machine. An unconfigured root is left
 * as its literal placeholder on purpose: a wrong path is worse than an obviously-unfilled one,
 * and {@link renderSkillPathContext} names what was left behind so the agent can tell the
 * difference between "aidd could not resolve this" and "the skill author wrote it that way".
 */
export function resolveSkillRootPlaceholders(text: string, roots: SkillRootPaths): string {
	let resolved = text;
	for (const [placeholder, key] of rootPlaceholders) {
		const value = roots[key];
		if (value === undefined || value === '') continue;
		resolved = resolved.replaceAll(placeholder, value);
	}
	return resolved;
}

const rootLabels = [
	['project', 'Project workspace (your working directory)'],
	['aidd', 'aidd installation'],
	['applications', 'Applications root'],
	['spernakit', 'Spernakit checkout'],
] as const satisfies readonly (readonly [keyof SkillRootPaths, string])[];

/**
 * Directive lines stating where each root actually is, so the layout is known before the first
 * command rather than inferred from a denial. Returns an empty array when nothing is known,
 * which keeps the directive unchanged for callers that have no root context to give.
 */
export function renderSkillPathContext(roots: SkillRootPaths): string[] {
	const known: string[] = [];
	for (const [key, label] of rootLabels) {
		const value = roots[key];
		if (value === undefined || value === '') continue;
		known.push(`- ${label}: ${value}`);
	}
	if (known.length === 0) return [];
	const unresolved = rootPlaceholders
		.filter(([, key]) => {
			const value = roots[key];
			return value === undefined || value === '';
		})
		.map(([placeholder]) => placeholder);
	const notes =
		unresolved.length === 0
			? []
			: [
					`Not configured on this machine and therefore left unresolved in the skill text below: ${unresolved.join(', ')}. A step that depends on one cannot be run — report it as unavailable instead of guessing a path.`,
				];
	return ['', 'Path context (resolved by aidd for this run):', ...known, ...notes];
}
