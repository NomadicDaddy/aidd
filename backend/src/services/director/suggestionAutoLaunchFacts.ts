import type { AutoLaunchProjectFacts } from './suggestionAutoLaunchBounds.ts';

/**
 * Reading what the project bounds need to know, once per project rather than once per suggestion.
 *
 * Separate from the launcher because it is the only part of auto-launch that touches the disk, and
 * separate from the bounds because the bounds must stay decidable without a working tree at all.
 */

/** Everything reading a project's state needs, and deliberately nothing else. */
export interface ProjectFactsSource {
	/** A run in flight, or a pipeline session between steps: either means the project is busy. */
	hasActiveWorkForProject(projectPath: string): Promise<boolean>;
	/** Dirty files in the working tree, or null when the tree could not be read at all. */
	readDirtyFileCount(projectPath: string): Promise<null | number>;
	/** Registered project route identity to absolute path, read once per cycle. */
	resolveProjectPaths(): Promise<Map<string, string>>;
}

/**
 * Project state, read once per project rather than once per suggestion.
 *
 * A cycle routinely produces several suggestions for one project, and each dirty-tree read is a
 * process. Caching also makes the answers consistent within a cycle: two suggestions for the same
 * repository can never disagree about whether its tree was clean.
 */
export class ProjectFactsCache {
	private readonly entries = new Map<string, AutoLaunchProjectFacts>();
	private paths: Map<string, string> | undefined;
	private readonly source: ProjectFactsSource;

	constructor(source: ProjectFactsSource) {
		this.source = source;
	}

	async read(projectId: string): Promise<AutoLaunchProjectFacts> {
		const cached = this.entries.get(projectId);
		if (cached) return cached;
		this.paths ??= await this.source.resolveProjectPaths();
		const path = this.paths.get(projectId) ?? null;
		// Short-circuited in the order the refusals are reported: an unknown project and a busy one
		// are both decided without touching the working tree.
		const hasActiveWork = path !== null && (await this.source.hasActiveWorkForProject(path));
		const dirtyFileCount =
			path === null || hasActiveWork ? 0 : await this.source.readDirtyFileCount(path);
		const facts: AutoLaunchProjectFacts = { dirtyFileCount, hasActiveWork, path };
		this.entries.set(projectId, facts);
		return facts;
	}
}
