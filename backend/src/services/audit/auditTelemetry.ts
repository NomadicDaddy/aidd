import { auditRunDriverId } from 'aidd-shared/run-provenance';

import type { RunService } from '../runService.ts';
import type { TelemetryService } from '../telemetryService.ts';

export async function recordAuditRunStart(
	telemetry: TelemetryService | undefined,
	run: Awaited<ReturnType<RunService['launchRun']>>,
	source: 'scheduled' | 'web',
	auditNames: readonly string[],
): Promise<void> {
	// The same ordering the CLI records as driverId, so the two identify a batch identically.
	const resourceName = auditRunDriverId(auditNames);
	await telemetry?.recordStart({
		backend: run.backend,
		model: run.model,
		projectName: run.projectName,
		projectPath: run.projectPath,
		resourceId: run.id,
		resourceName: resourceName || 'audit-all',
		resourceType: 'run',
		runId: run.id,
		source,
		startedAt: run.startedAt,
	});
}
