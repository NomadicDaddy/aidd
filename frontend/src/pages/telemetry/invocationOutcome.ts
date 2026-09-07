import type { TelemetryOutcomeBucket } from 'aidd-shared/runs/outcome';

import { classifyWebRunTelemetryBucket } from 'aidd-shared/runs/outcome';

import type { InvocationRecord, TelemetryInvocationStatus } from '../../api/types.ts';

const rawStatusBuckets: Record<TelemetryInvocationStatus, TelemetryOutcomeBucket> = {
	completed: 'completed',
	failed: 'failed',
	killed: 'killed',
	running: 'running',
	stopped: 'stopped',
};

export function invocationOutcomeBucket(invocation: InvocationRecord): TelemetryOutcomeBucket {
	if (invocation.runStatus === null) return rawStatusBuckets[invocation.status];
	return classifyWebRunTelemetryBucket({
		exitCode: invocation.runExitCode,
		status: invocation.runStatus,
		stopReason: invocation.runStopReason,
		summary: invocation.runSummary,
	});
}
