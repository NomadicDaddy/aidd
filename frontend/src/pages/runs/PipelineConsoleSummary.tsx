import { Link } from 'react-router';

import type { PipelineSessionRecord } from '../../api/types.ts';

import { Badge } from '../../components/ui/badge.tsx';
import { buttonClassName } from '../../components/ui/button.tsx';
import { Card } from '../../components/ui/card.tsx';
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
		<div className="space-y-3">
			<Card className="space-y-2">
				<div className="flex flex-wrap items-center gap-2">
					<h2 className="text-sm font-semibold text-foreground">{session.recipeName}</h2>
					<Badge tone={sessionStatusTone(session.status)}>
						{sessionStatusLabel(session.status)}
					</Badge>
					<span className="text-xs text-neutral-500">
						{session.currentStepIndex}/{session.totalSteps} steps
					</span>
					<Link
						className={buttonClassName('secondary', 'ml-auto', 'compact')}
						to={`/pipeline-sessions/${session.id}`}>
						Full report
					</Link>
				</div>
				{session.errorMessage && (
					<p className="text-sm text-red-700 dark:text-red-300">{session.errorMessage}</p>
				)}
				<p className="text-xs text-neutral-500">
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
