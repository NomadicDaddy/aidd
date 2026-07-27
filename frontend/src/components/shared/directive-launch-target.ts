import type { ProjectNameSummary } from '../../api/types.ts';

import { projectDetailTarget } from '../layout/project-nav-target.ts';

export function chooseDirectiveProjectPath(
	projects: ProjectNameSummary[],
	pathname: string,
): string {
	return (
		projects.find((project) => projectDetailTarget(project.routeId, '') === pathname)?.path ??
		''
	);
}
