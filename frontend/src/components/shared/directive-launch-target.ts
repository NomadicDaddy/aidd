import type { ProjectNameSummary } from '../../api/types.ts';

import { projectDetailTarget } from '../layout/project-nav-target.ts';

export interface DirectiveProjectSeedState {
	openingPathname: null | string;
	seeded: boolean;
}

interface DirectiveProjectSeedInput {
	open: boolean;
	pathname: string;
	projects: readonly ProjectNameSummary[] | undefined;
}

interface DirectiveProjectSeedResult {
	projectDir: null | string;
	state: DirectiveProjectSeedState;
}

export function createDirectiveProjectSeedState(): DirectiveProjectSeedState {
	return { openingPathname: null, seeded: false };
}

export function advanceDirectiveProjectSeed(
	state: DirectiveProjectSeedState,
	input: DirectiveProjectSeedInput,
): DirectiveProjectSeedResult {
	if (!input.open) {
		return { projectDir: null, state: createDirectiveProjectSeedState() };
	}

	const openingPathname = state.openingPathname ?? input.pathname;
	if (state.seeded || input.projects === undefined) {
		return {
			projectDir: null,
			state: { openingPathname, seeded: state.seeded },
		};
	}

	return {
		projectDir: chooseDirectiveProjectPath(
			visibleDirectiveProjects(input.projects),
			openingPathname,
		),
		state: { openingPathname, seeded: true },
	};
}

export function chooseDirectiveProjectPath(
	projects: ProjectNameSummary[],
	pathname: string,
): string {
	return (
		projects.find((project) => projectDetailTarget(project.routeId, '') === pathname)?.path ??
		''
	);
}

export function describeTargetSource(isLoading: boolean, projectConfigApplied?: boolean): string {
	if (isLoading) return 'Resolving launch target…';
	return projectConfigApplied
		? 'Project configuration applied.'
		: 'Global configuration applied.';
}

export function visibleDirectiveProjects(
	projects: readonly ProjectNameSummary[],
): ProjectNameSummary[] {
	return projects
		.filter((project) => !project.name.endsWith('.old'))
		.sort((left, right) => left.name.localeCompare(right.name));
}
