import type { UseQueryResult } from '@tanstack/react-query';

import { useQueryClient } from '@tanstack/react-query';

import { DataFreshness } from '../../components/shared/DataFreshness.tsx';
import { traceDataMovement } from '../../lib/dataMovementTrace.ts';

/**
 * Telemetry's freshness readout and refresh control.
 *
 * SYS-4: the other live surface that had no freshness readout. Telemetry is read continuously
 * while something else is running, which is exactly when "is this number current" matters and
 * exactly when the page gave no answer.
 *
 * The refresh takes the `telemetry` key prefix rather than listing the eight queries under it.
 * Several of those keys carry the current filter values, so a hand-listed set would silently stop
 * covering them the moment a filter changed; a prefix cannot drift that way.
 *
 * It is a component rather than an inline block because `TelemetryPage` sat three lines under the
 * 300-line cap, so the control had nowhere to live in the page itself.
 */
export function TelemetryFreshness({
	backends,
	invocations,
	timeseries,
	top,
}: {
	backends: UseQueryResult<unknown>;
	invocations: UseQueryResult<unknown>;
	timeseries: UseQueryResult<unknown>;
	top: UseQueryResult<unknown>;
}) {
	const queryClient = useQueryClient();

	async function refresh(): Promise<boolean> {
		traceDataMovement({
			category: 'event',
			layer: 'ui',
			operation: 'telemetry.refresh',
			source: 'TelemetryPage',
			summary: { queries: ['telemetry.*'] },
		});
		const results = await Promise.allSettled([
			queryClient.refetchQueries({ queryKey: ['telemetry'] }, { throwOnError: true }),
		]);
		return results.every((result) => result.status === 'fulfilled');
	}

	return (
		<DataFreshness
			label="Telemetry data"
			onRefresh={refresh}
			sources={[
				{ label: 'Top resources', query: top },
				{ label: 'Timeseries', query: timeseries },
				{ label: 'Invocations', query: invocations },
				{ label: 'Backends', query: backends },
			]}
		/>
	);
}
