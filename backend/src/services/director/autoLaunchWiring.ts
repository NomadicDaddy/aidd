import type { ResolvedDirectorSuggestionsAutoLaunchConfig } from 'aidd-shared/config/types';

import {
	defaultDirectorAutoLaunchAllowedRecipes,
	defaultDirectorAutoLaunchEnabled,
	defaultDirectorAutoLaunchMaxPerCycle,
	defaultDirectorAutoLaunchMaxRank,
	defaultDirectorAutoLaunchRiskCeiling,
} from 'aidd-shared/config/defaults';
import { and, inArray } from 'drizzle-orm';

import type { WebDatabase } from '../../db/client.ts';
import type { DirectorConfig } from './types.ts';

import { projectPathMatches } from '../../db/commands/projectPaths.ts';
import { pipelineSessions } from '../../db/schema.ts';
import { readProjectGitStatus } from '../git/status.ts';
import { activeSessionStatuses } from '../pipeline/helpers.ts';

/**
 * An install with no `[director]` block at all resolves the whole section to undefined, so the
 * bounds are restated here rather than defaulted field by field at the call site. Both roads lead to
 * the same place — auto-launch off — and this way there is one expression to read.
 *
 * @param config The resolved director config, whose suggestions block may be absent entirely.
 * @returns The bounds in force for this install.
 */
export function autoLaunchBounds(
	config: DirectorConfig,
): ResolvedDirectorSuggestionsAutoLaunchConfig {
	return (
		config.director?.suggestions.autoLaunch ?? {
			allowedRecipes: defaultDirectorAutoLaunchAllowedRecipes,
			enabled: defaultDirectorAutoLaunchEnabled,
			maxPerCycle: defaultDirectorAutoLaunchMaxPerCycle,
			maxRank: defaultDirectorAutoLaunchMaxRank,
			riskCeiling: defaultDirectorAutoLaunchRiskCeiling,
		}
	);
}

/**
 * The registered projects, as the identity-to-path map the bounds resolve a suggestion's project
 * with.
 *
 * Keyed by route identity rather than folder name. Two checkouts called `sample` used to collapse
 * onto one entry here, so whichever of them the map happened to keep was the tree the dirty-tree
 * and active-work checks read — while the launch itself could go to the other. A route identity is
 * unique by construction, so every project keeps its own entry and a legacy suggestion naming only
 * `sample` finds none once a second `sample` exists: no path, and the bounds refuse it.
 *
 * Read once per cycle rather than once per suggestion.
 *
 * @param listProjects The project service's listing, as it is already shaped.
 * @returns Project route identity to absolute path.
 */
export async function projectPathIndex(
	listProjects: () => Promise<{ projects: { path: string; routeId: string }[] }>,
): Promise<Map<string, string>> {
	const { projects } = await listProjects();
	return new Map(projects.map((project) => [project.routeId, project.path]));
}

/**
 * A tree that could not be read reports null rather than zero, so the launcher can refuse it as
 * unknown local state instead of mistaking an unreadable repository for a clean one. A directory
 * that is not a repository has no local changes to be wary of and reports zero.
 *
 * @param projectPath Absolute path to the project's working tree.
 * @returns The dirty file count, or null when the tree could not be read at all.
 */
/**
 * Whether anything is already at work in a project — a run in flight, or a pipeline session between
 * its steps.
 *
 * `hasActiveRunForProject` answers about runs alone, and a session spends much of its life with no
 * run of its own: between two steps, and throughout a shell or hook step, nothing in `runs` is
 * running at all. That gap did not matter while the bounds refused every recipe. Now that the
 * Director may start a several-step session, the same project could otherwise take a second session
 * on top of the first in the seconds the first spends deciding what to do next — so the claim is
 * held for the session's whole life, not just for the runs inside it.
 *
 * @param db The web database.
 * @param hasActiveRunForProject The run half of the question, as the run service answers it.
 * @returns A predicate over an absolute project path: true when that project must be left alone.
 */
export function projectBusyCheck(
	db: WebDatabase,
	hasActiveRunForProject: (projectPath: string) => Promise<boolean>,
): (projectPath: string) => Promise<boolean> {
	return async (projectPath) => {
		if (await hasActiveRunForProject(projectPath)) return true;
		const rows = await db
			.select({ id: pipelineSessions.id })
			.from(pipelineSessions)
			.where(
				and(
					projectPathMatches(pipelineSessions.projectPath, projectPath),
					inArray(pipelineSessions.status, [...activeSessionStatuses]),
				),
			)
			.limit(1);
		return rows.length > 0;
	};
}

export async function readDirtyFileCount(projectPath: string): Promise<null | number> {
	const status = await readProjectGitStatus(projectPath);
	if (status.state === 'error' || status.state === 'project-missing') return null;
	return status.state === 'not-a-repo' ? 0 : status.total;
}
