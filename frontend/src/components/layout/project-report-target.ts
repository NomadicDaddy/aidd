import type { ProjectSummary } from '../../api/types.ts';

type ReportProject = Pick<ProjectSummary, 'id' | 'name' | 'path'>;

export function isAiddReportProject(project: ReportProject): boolean {
	const name = project.name.trim().toLowerCase();
	if (name === 'aidd') return true;

	const normalizedPath = project.path.replace(/\\/g, '/').toLowerCase();
	return normalizedPath.endsWith('/aidd');
}

export function chooseReportProjectId(projects: ReportProject[]): string {
	return projects.find(isAiddReportProject)?.id ?? '';
}
