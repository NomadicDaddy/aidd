import type { ProjectImportCandidateResult } from '../../api/types.ts';

export function projectImportResultSummary(results: ProjectImportCandidateResult[]): string {
	const imported = results.filter((result) => result.status === 'imported').length;
	const failed = results.length - imported;
	if (failed === 0) return `${imported} project${imported === 1 ? '' : 's'} imported`;
	return `${imported} imported, ${failed} failed`;
}
