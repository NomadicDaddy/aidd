import { discoverAuditNames } from 'aidd-shared/modes/audit-shared';

// Re-export from extracted modules
export type { MaturityComputeInput } from './maturity/artifactClassification.ts';
export { computeMaturity, toMaturityBadge } from './maturity/scoreAggregation.ts';

export async function listProjectAuditCatalog(rootDir: string): Promise<string[]> {
	try {
		return await discoverAuditNames(rootDir);
	} catch {
		return [];
	}
}
