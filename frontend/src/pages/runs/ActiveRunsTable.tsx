import type { RunRecord } from '../../api/types.ts';

import { Card } from '../../components/ui/card.tsx';
import { useNow } from '../../hooks/useNow.ts';
import { ActiveRunMobileCard, ActiveRunRow } from './ActiveRunRow.tsx';

export function ActiveRunsTable({
	continuedRunIds,
	continuePendingId,
	onContinue,
	onKill,
	onSelect,
	onStop,
	runs,
	selectedRunId,
}: {
	/** Ids of runs that already have a follow-up run; their Continue button is hidden. */
	continuedRunIds: ReadonlySet<string>;
	/** Run id whose continue request is in flight (disables all Continue buttons). */
	continuePendingId: string | undefined;
	onContinue: (id: string) => void;
	onKill: (id: string) => void;
	onSelect: (id: string) => void;
	onStop: (id: string) => void;
	runs: RunRecord[];
	selectedRunId: string | undefined;
}) {
	// The 1s clock that advances live durations/liveness lives here, scoped to the table, so a
	// running run only re-renders these rows — not the launch form, filters, or live console.
	const now = useNow(runs.some((run) => run.status === 'running'));
	return (
		<Card className="overflow-hidden p-0">
			<div className="border-b px-4 py-3 dark:border-neutral-800">
				<h2 className="text-sm font-semibold text-neutral-950 dark:text-neutral-50">
					Recent runs
				</h2>
				<p className="text-xs text-neutral-500">
					Recent aidd runs from UI launches and CLI sessions (last 24 h).
				</p>
			</div>
			<div className="hidden md:block">
				<table aria-label="Recent runs" className="w-full text-left text-sm">
					<thead className="border-b bg-neutral-50 text-xs text-neutral-500 uppercase dark:bg-neutral-900">
						<tr>
							<th className="px-4 py-3" scope="col">
								Run
							</th>
							<th className="px-4 py-3" scope="col">
								Status
							</th>
							<th className="px-4 py-3" scope="col">
								Duration
							</th>
							<th className="px-4 py-3" scope="col">
								Controls
							</th>
						</tr>
					</thead>
					<tbody>
						{runs.length === 0 && (
							<tr>
								<td className="px-4 py-4 text-neutral-500" colSpan={4}>
									No runs match the current filters.
								</td>
							</tr>
						)}
						{runs.map((run) => (
							<ActiveRunRow
								continued={continuedRunIds.has(run.id)}
								continuePendingId={continuePendingId}
								key={run.id}
								now={now}
								onContinue={onContinue}
								onKill={onKill}
								onSelect={onSelect}
								onStop={onStop}
								run={run}
								selected={run.id === selectedRunId}
							/>
						))}
					</tbody>
				</table>
			</div>
			<div
				aria-label="Recent runs"
				className="flex flex-col divide-y md:hidden dark:divide-neutral-800"
				role="list">
				{runs.length === 0 && (
					<p className="px-4 py-4 text-sm text-neutral-500">
						No runs match the current filters.
					</p>
				)}
				{runs.map((run) => (
					<ActiveRunMobileCard
						continued={continuedRunIds.has(run.id)}
						continuePendingId={continuePendingId}
						key={run.id}
						now={now}
						onContinue={onContinue}
						onKill={onKill}
						onSelect={onSelect}
						onStop={onStop}
						run={run}
						selected={run.id === selectedRunId}
					/>
				))}
			</div>
		</Card>
	);
}
