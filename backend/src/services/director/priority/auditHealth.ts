import {
	createAuditFreshnessContext,
	evaluateAuditReportFreshness,
	type AuditFreshnessContext,
} from 'aidd-shared/metadata/audit-freshness';
import { discoverProjectAuditNames } from 'aidd-shared/modes/audit-shared';

import type { ProjectArtifactCheckSummary } from '../../../types.ts';
import type { DirectorAuditHealth } from './types.ts';

export async function checkAuditHealth(
	catalogDir: string,
	projectDir: string,
	artifactCheck: null | ProjectArtifactCheckSummary,
	options: { auditFreshnessContext?: AuditFreshnessContext } = {}
): Promise<DirectorAuditHealth> {
	const staleThresholdDays = artifactCheck?.staleThresholdDays ?? 30;
	const auditNames = await discoverProjectAuditNames(projectDir, {
		applyProfile: true,
		catalogDir,
	});
	const now = Date.now();
	const context = options.auditFreshnessContext ?? createAuditFreshnessContext();
	const fresh: string[] = [];
	const missing: string[] = [];
	const stale: DirectorAuditHealth['stale'] = [];
	for (const auditName of auditNames) {
		const freshness = await evaluateAuditReportFreshness(projectDir, auditName, { context });
		if (freshness.status === 'missing') {
			missing.push(auditName);
			continue;
		}
		if (freshness.status === 'stale') {
			stale.push({
				ageDays: freshness.ageDays,
				changes: freshness.changes,
				name: auditName,
				reasons: freshness.staleReasons,
				report: freshness.report ?? auditName,
			});
		} else {
			fresh.push(auditName);
		}
	}
	return {
		checkedAt: new Date(now).toISOString(),
		fresh,
		missing,
		stale,
		staleThresholdDays,
	};
}
