/**
 * Which discovered projects the interface shows.
 *
 * The spernakit template checkout is a project by every structural test, so discovery returns it
 * and `web.showSpernakitProject` decides whether anyone sees it. That rule is shared here because
 * the projects page and the sidebar count read two different endpoints: a page listing 39 beside
 * a nav badge reading 40 is the failure this exists to prevent.
 */
export function visibleProjects<T extends { isSpernakitTemplate?: boolean }>(
	projects: T[],
	showSpernakitProject: boolean,
): T[] {
	if (showSpernakitProject) return projects;
	return projects.filter((project) => !project.isSpernakitTemplate);
}
