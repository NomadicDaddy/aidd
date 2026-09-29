import type { TelemetryBackendUsageRow } from '../../api/types.ts';

import { SkeletonLines } from '../../components/shared/LoadingState.tsx';
import { Card, CardHeader } from '../../components/ui/card.tsx';
import { BackendBreakdownCard } from './TelemetryComponents.tsx';

/**
 * The CLI-mix card: which backend ran the invocations in the current filter.
 *
 * Extracted from `TelemetryPage` rather than left inline. The page sat three lines under the
 * 300-line cap, so adding its freshness control (SYS-4) put it over, and the gate asks for a
 * cohesive module rather than a raised baseline. This card is the most self-contained block on
 * the page: one query, one presenter, no shared state with its neighbours.
 */
export function CliMixCard({
	isLoading,
	rows,
}: {
	isLoading: boolean;
	rows: TelemetryBackendUsageRow[];
}) {
	return (
		<Card className="@container flex flex-col gap-3">
			<CardHeader
				className="mb-0"
				description="All invocations in the selected filters."
				title="CLI mix"
			/>
			{isLoading && rows.length === 0 ? (
				<SkeletonLines count={4} label="Loading CLI mix…" />
			) : (
				<BackendBreakdownCard rows={rows} />
			)}
		</Card>
	);
}
