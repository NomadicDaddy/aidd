import { Link } from 'react-router';

import type { PipelineSessionRecord } from '../../api/types.ts';

import { Badge } from '../../components/ui/badge.tsx';
import { buttonClassName } from '../../components/ui/button.tsx';
import { Card, CardHeader } from '../../components/ui/card.tsx';
import { usePipelineSessionReport } from '../../hooks/usePipelineSessions.ts';
import { useRunRecord } from '../../hooks/useRuns.ts';
import { pipelineProgressLabel } from '../../lib/pipelineProgress.ts';
import { toneText } from '../../lib/tones.ts';
import { LiveConsolePanel } from './LiveConsolePanel.tsx';
import { isSessionActive, sessionStatusLabel, sessionStatusTone } from './pipelineSessionStatus.ts';

// Console pane for a selected pipeline session: a compact session summary above a live
// console streaming the most recent step that has spawned a run. Step-level selection
// (clicking a step's Console button) switches the page selection to that run directly.
function consoleCaption(
	active: boolean,
	step: { sequenceNumber: number; stepName: string } | undefined,
): string {
	if (!step) {
		return active ? 'Waiting for the first step to start a run…' : 'No step started a run.';
	}
	const where = `step ${step.sequenceNumber} — ${step.stepName}`;
	return active ? `Streaming ${where}` : `Showing ${where}, the last step that started a run`;
}

export function PipelineConsoleSummary({ session }: { session: PipelineSessionRecord }) {
	const report = usePipelineSessionReport(session.id);
	// The most recent step that has a run is the one worth streaming; earlier runs are a
	// click away via the step rows.
	const latestStepWithRun = report.data
		? [...report.data.stepResults].reverse().find((step) => step.runId !== null)
		: undefined;
	const streamRunId = latestStepWithRun?.runId ?? undefined;
	const streamRun = useRunRecord(streamRunId, streamRunId !== undefined);
	const displayedSession = report.data?.session ?? session;
	const active = isSessionActive(displayedSession.status);
	return (
		// Shares the runs-page console cell, so it needs the same height chain: the summary card
		// stays auto-height and the console below it takes the rest.
		<div className="space-y-3 @min-[88.375rem]:flex @min-[88.375rem]:min-h-0 @min-[88.375rem]:flex-1 @min-[88.375rem]:flex-col">
			<Card className="flex flex-col gap-2">
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
							<Badge tone={sessionStatusTone(displayedSession.status)}>
								{sessionStatusLabel(displayedSession.status)}
							</Badge>
							<span className="text-xs text-muted-foreground">
								{pipelineProgressLabel(displayedSession)}
							</span>
						</>
					}
					className="mb-0"
					title={session.recipeName}
				/>
				{displayedSession.errorMessage && (
					<p className={`text-sm ${toneText.red}`}>{displayedSession.errorMessage}</p>
				)}
				{/* The console below is streaming only while the session is. On a finished session
				    this line still read 'Streaming step 1' — the present progressive asserting live
				    output over a transcript that stopped moving hours ago. */}
				<p className="text-xs text-muted-foreground">
					{consoleCaption(active, latestStepWithRun)}
				</p>
			</Card>
			<LiveConsolePanel
				selectedRun={streamRun.data ?? undefined}
				selectedRunId={streamRunId}
			/>
		</div>
	);
}
