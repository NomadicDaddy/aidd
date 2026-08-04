import type { ProjectLocalIteration, ProjectLocalRun } from '../../api/types.ts';

import { Card } from '../ui/card.tsx';
import { LocalIterationsTable } from './local-aidd-history/LocalIterationsTable.tsx';
import { LocalRunsTable } from './local-aidd-history/LocalRunsTable.tsx';
import { groupIterationsByRun } from './local-aidd-history/runMetadata.tsx';
import { useNowWhile } from './local-aidd-history/useNowWhile.ts';

export function LocalAiddHistoryPanel({
	description,
	iterations,
	runs,
	title = 'aidd run history',
}: {
	description: string;
	iterations: ProjectLocalIteration[];
	runs?: ProjectLocalRun[];
	title?: string;
}) {
	const hasRuns = runs !== undefined;
	const runList = runs ?? [];
	const hasRunRows = runList.length > 0;
	const hasIterationRows = iterations.length > 0;
	const now = useNowWhile(iterations.some((iteration) => iteration.status === 'running'));
	const { byRunKey, orphans, running } = hasRuns
		? groupIterationsByRun(runList, iterations)
		: {
				byRunKey: new Map<string, ProjectLocalIteration[]>(),
				orphans: iterations,
				running: [] as ProjectLocalIteration[],
			};
	return (
		<Card className="overflow-hidden p-0">
			<div className="border-b border-border px-4 py-3">
				<h2 className="text-sm font-semibold text-foreground">{title}</h2>
				<p className="text-xs text-muted-foreground">{description}</p>
			</div>
			{hasRuns ? (
				<>
					<section className="border-b border-border last:border-0">
						<div className="px-4 py-3">
							<h3 className="text-xs font-semibold text-muted-foreground uppercase">
								Runs
							</h3>
						</div>
						{hasRunRows ? (
							<LocalRunsTable
								iterationsByRunKey={byRunKey}
								now={now}
								runs={runList}
							/>
						) : running.length > 0 ? (
							<div className="px-4 pb-4 text-sm text-muted-foreground">
								A run is in progress. Its summary will appear here once it finishes.
							</div>
						) : (
							<div className="px-4 pb-4 text-sm text-muted-foreground">
								No run summary entries found.
							</div>
						)}
					</section>
					{running.length > 0 ? (
						<section className="border-b border-border last:border-0">
							<div className="px-4 py-3">
								<h3 className="text-xs font-semibold text-muted-foreground uppercase">
									In progress
								</h3>
								<p className="text-xs text-muted-foreground">
									A run is active; its summary will appear under Runs once it
									finishes.
								</p>
							</div>
							<LocalIterationsTable iterations={running} now={now} />
						</section>
					) : null}
					{orphans.length > 0 ? (
						<section>
							<div className="px-4 py-3">
								<h3 className="text-xs font-semibold text-muted-foreground uppercase">
									Unassigned iterations
								</h3>
								<p className="text-xs text-muted-foreground">
									Iterations whose start time does not fall within any recorded
									run window.
								</p>
							</div>
							<LocalIterationsTable iterations={orphans} now={now} />
						</section>
					) : null}
				</>
			) : (
				<section>
					<div className="px-4 py-3">
						<h3 className="text-xs font-semibold text-muted-foreground uppercase">
							Iterations
						</h3>
					</div>
					{hasIterationRows ? (
						<LocalIterationsTable iterations={iterations} now={now} />
					) : (
						<div className="px-4 pb-4 text-sm text-muted-foreground">
							No aidd iterations found.
						</div>
					)}
				</section>
			)}
		</Card>
	);
}
