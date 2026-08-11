import type { ReactNode } from 'react';

import type { ProjectLocalIteration, ProjectLocalRun } from '../../api/types.ts';

import { Card, CardHeader } from '../ui/card.tsx';
import { LocalIterationsTable } from './local-aidd-history/LocalIterationsTable.tsx';
import { LocalRunsTable } from './local-aidd-history/LocalRunsTable.tsx';
import { groupIterationsByRun } from './local-aidd-history/runMetadata.tsx';
import { useNowWhile } from './local-aidd-history/useNowWhile.ts';

/**
 * A group of rows inside the panel — Runs, In progress, Unassigned iterations.
 *
 * `subsection` is the second and last visual step ui/card defines, so these read one step under the
 * panel's own title instead of dropping to a `text-xs` uppercase third step that nothing else on
 * the Runs tab uses. `headingLevel={3}` keeps the accessibility tree nesting under the card's h2
 * while the type says subsection.
 */
function SectionHeading({ description, title }: { description?: string; title: string }) {
	return (
		<CardHeader
			className="mb-0 px-4 py-3"
			description={description}
			headingLevel={3}
			level="subsection"
			title={title}
		/>
	);
}

export function LocalAiddHistoryPanel({
	description,
	iterations,
	runs,
	title = 'aidd run history',
}: {
	// Nodes, not a string: the callers describe file paths, and the one caller that had them was
	// spelling them with markdown backticks into a plain <p>, which printed the backticks.
	description: ReactNode;
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
			{/* Carded like its two peers on the Runs tab rather than hand-rolled. The title used to
			    be a bare `text-sm` h2 sitting directly under `AI usage` and `Recent runs` at
			    `text-base` — three peer cards, three heading sizes — and the section labels inside
			    it were a third step at `text-xs` uppercase, which ui/card exists to forbid: two
			    visual steps, and only two. */}
			<CardHeader
				className="mb-0 border-b border-border px-4 py-3"
				description={description}
				title={title}
			/>
			{hasRuns ? (
				<>
					<section className="border-b border-border last:border-0">
						<SectionHeading title="Runs" />
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
							<SectionHeading
								description="A run is active; its summary will appear under Runs once it finishes."
								title="In progress"
							/>
							<LocalIterationsTable iterations={running} now={now} />
						</section>
					) : null}
					{orphans.length > 0 ? (
						<section>
							<SectionHeading
								description="Iterations whose start time does not fall within any recorded run window."
								title="Unassigned iterations"
							/>
							<LocalIterationsTable iterations={orphans} now={now} />
						</section>
					) : null}
				</>
			) : (
				<section>
					<SectionHeading title="Iterations" />
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
