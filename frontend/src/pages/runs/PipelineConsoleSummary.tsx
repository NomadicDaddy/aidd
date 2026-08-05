import { Link } from 'react-router';

import type { PipelineSessionRecord } from '../../api/types.ts';

import { Badge } from '../../components/ui/badge.tsx';
import { buttonClassName } from '../../components/ui/button.tsx';
import { Card, CardHeader } from '../../components/ui/card.tsx';
import { usePipelineSessionReport } from '../../hooks/usePipelineSessions.ts';
import { useRunRecord } from '../../hooks/useRuns.ts';
import { LiveConsolePanel } from './LiveConsolePanel.tsx';
import { sessionStatusLabel, sessionStatusTone } from './pipelineSessionStatus.ts';

// Console pane for a selected pipeline session: a compact session summary above a live
// console streaming the most recent step that has spawned a run. Step-level selection
// (clicking a step's Console button) switches the page selection to that run directly.
export function PipelineConsoleSummary({ session }: { session: PipelineSessionRecord }) {
	const report = usePipelineSessionReport(session.id);
	// The most recent step that has a run is the one worth streaming; earlier runs are a
	// click away via the step rows.
	const latestStepWithRun = report.data
		? [...report.data.stepResults].reverse().find((step) => step.runId !== null)
		: undefined;
	const streamRunId = latestStepWithRun?.runId ?? undefined;
	const streamRun = useRunRecord(streamRunId, streamRunId !== undefined);
	return (
		// Shares the runs-page console cell, so it needs the same height chain: the summary card
		// stays auto-height and the console below it takes the rest.
		<div className="space-y-3 2xl:flex 2xl:min-h-0 2xl:flex-1 2xl:flex-col">
			<Card className="space-y-2">
				<CardHeader
					action={
						<Link
							className={buttonClassName('secondary', '', 'compact')}
							to={`/pipeline-sessions/${session.id}`}>
							Full report
						</Link>
					}
					badge={
						<>
							<Badge tone={sessionStatusTone(session.status)}>
								{sessionStatusLabel(session.status)}
							</Badge>
							<span className="text-xs text-muted-foreground">
								{session.currentStepIndex}/{session.totalSteps} steps
							</span>
						</>
					}
					className="mb-0"
					title={session.recipeName}
				/>
				{session.errorMessage && (
					<p className="text-sm text-red-700 dark:text-red-300">{session.errorMessage}</p>
				)}
				<p className="text-xs text-muted-foreground">
					{latestStepWithRun
						? `Streaming step ${latestStepWithRun.sequenceNumber} — ${latestStepWithRun.stepName}`
						: 'Waiting for the first step to start a run…'}
				</p>
			</Card>
			<LiveConsolePanel
				selectedRun={streamRun.data ?? undefined}
				selectedRunId={streamRunId}
			/>
		</div>
	);
}
