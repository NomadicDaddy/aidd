import {
	type AuditFreshnessContext,
	type AuditReportFreshness,
	evaluateAuditReportFreshness,
} from 'aidd-shared/metadata/audit-freshness';
import { unavailableMarker } from 'aidd-shared/modes/audit-shared';

/**
 * Report freshness as every panel surface reads it. A report recording that an audit could not
 * run is on disk for its reason, not as evidence, so it is passed over here exactly as the CLI's
 * audit selection passes it over: the catalog, maturity, and director views must not show an
 * audit as fresh when nothing audited the project.
 * @param projectDir The project whose audit reports are read.
 * @param auditName The audit to evaluate.
 * @param context The per-request cache shared by every audit of one project.
 * @returns Freshness of the newest report that is real audit evidence.
 */
export async function auditReportFreshness(
	projectDir: string,
	auditName: string,
	context: AuditFreshnessContext,
): Promise<AuditReportFreshness> {
	return await evaluateAuditReportFreshness(projectDir, auditName, {
		context,
		excludedReportMarkers: [unavailableMarker],
	});
}
