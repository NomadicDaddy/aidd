import { visibleProjects } from '../lib/projectVisibility.ts';
import { useProjectNames } from './useProjectNames.ts';
import { useSettingsConfig } from './useSettingsConfig.ts';

/**
 * Discovered-project count for the sidebar badge.
 *
 * Both queries are imported from their own single-hook modules rather than from `useProjects.ts`
 * and `useSettings.ts`: the sidebar mounts on every page, so anything it reaches is critical-path
 * code, and those two modules carry the whole project-mutation and settings-update surface behind
 * them. Pulling them in cost 4.8 KB gzip and broke the critical-path budget.
 *
 * The spernakit template checkout is hidden on the same setting the projects page reads, and the
 * count is null until both queries have answered — otherwise the badge would show a number one too
 * high for as long as the settings request takes.
 */
export function useProjectCount(): null | number {
	const names = useProjectNames();
	const settings = useSettingsConfig();
	if (names.data === undefined || settings.data === undefined) return null;
	return visibleProjects(names.data.projects, settings.data.showSpernakitProject).length;
}
