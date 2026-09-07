import { default as ArrowLeft } from 'lucide-react/dist/esm/icons/arrow-left';
import { default as CircleStop } from 'lucide-react/dist/esm/icons/circle-stop';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';

import type { PipelineSessionReport } from '../../api/types.ts';

import { ApiError } from '../../api/client.ts';
import { ConfirmDialog } from '../../components/shared/ConfirmDialog.tsx';
import { ErrorState } from '../../components/shared/ErrorState.tsx';
import { LoadingState } from '../../components/shared/LoadingState.tsx';
import { PageHeader } from '../../components/shared/PageHeader.tsx';
import { PageRail } from '../../components/shared/PageRail.tsx';
import { Button, buttonClassName } from '../../components/ui/button.tsx';
import { Card } from '../../components/ui/card.tsx';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.ts';
import { useNow } from '../../hooks/useNow.ts';
import { usePipelineSessionReport, usePipelineSessions } from '../../hooks/usePipelineSessions.ts';
import { pageRailByContentType } from '../../lib/contentRails.ts';
import { touchTargetTextClass } from '../../lib/touchTarget.ts';
import { sectionCaptionClass } from '../../lib/typography.ts';
import { pipelineSessionStepSummary } from './pipelineSessionSummary.ts';
import { SessionSummaryCard } from './SessionSummaryCard.tsx';
import { buildStepRows } from './stepRowModel.ts';
import { ExecutedStepRow, PendingStepRow } from './StepRows.tsx';

const PAGE_RAIL = pageRailByContentType.reading;

export function PipelineSessionReportPage() {
	const { id } = useParams();
	const reportQuery = usePipelineSessionReport(id);
	const pipelineSessions = usePipelineSessions();
	const report = reportQuery.data;
	const [showStopConfirm, setShowStopConfirm] = useState(false);
	const stopPending = pipelineSessions.stopSession.isPending;
	const sessionStatus = report?.session.status;
	const canStop = sessionStatus === 'queued' || sessionStatus === 'running';
	const now = useNow(canStop);

	const handleConfirmStop = () => {
		if (!id) return;
		pipelineSessions.stopSession.mutate(id, {
			onError: (error) => {
				const message =
					error instanceof Error && error.message !== ''
						? error.message
						: 'Could not stop session';
				toast.error(message);
				setShowStopConfirm(false);
			},
			onSuccess: () => {
				toast.success('Session stopped');
				setShowStopConfirm(false);
			},
		});
	};
	useDocumentTitle(
		report ? `${report.session.recipeName} · Pipeline Sessions` : 'Pipeline Session',
	);
	const notFound = reportQuery.error instanceof ApiError && reportQuery.error.status === 404;
	const hasOtherError = reportQuery.error !== null && !notFound;

	if (!id) return null;

	const backLink = (
		<Link
			className={`inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground ${touchTargetTextClass}`}
			to="/runs">
			<ArrowLeft className="h-4 w-4" />
			Runs
		</Link>
	);

	if (notFound) {
		return (
			<div className="page-reveal space-y-5">
				{backLink}
				<Card>
					<h1 className="text-xl font-semibold text-foreground">
						Pipeline session not found
					</h1>
					<p className="mt-2 text-sm text-muted-foreground">
						No pipeline session matches this URL. The session may have been removed or
						the link may be incorrect.
					</p>
					<div className="mt-4">
						<Link className={buttonClassName()} to="/runs">
							Back to Runs
						</Link>
					</div>
				</Card>
			</div>
		);
	}

	return (
		<PageRail className="page-reveal space-y-5" rail={PAGE_RAIL}>
			<PageHeader
				actions={
					report !== undefined && canStop ? (
						<Button
							disabled={stopPending}
							onClick={() => setShowStopConfirm(true)}
							variant="danger">
							<CircleStop className="h-4 w-4" />
							Stop
						</Button>
					) : undefined
				}
				breadcrumb={{ label: 'Runs', to: '/runs' }}
				// The session id is the value an operator pastes into a CLI or a log search, and it
				// lived only in the URL; the description slot every other page fills also keeps this
				// header from sitting empty beside the title.
				description={
					report ? (
						<>
							Pipeline session{' '}
							<span className="font-mono text-xs">{report.session.id}</span>
							<span className="whitespace-nowrap">
								{' '}
								· {report.session.projectName}
							</span>
						</>
					) : undefined
				}
				helpSlug="pipelines"
				title={
					report?.session.recipeName ??
					(reportQuery.isLoading ? 'Loading…' : 'Pipeline session')
				}
			/>

			{!report && reportQuery.isLoading && (
				<LoadingState message="Loading pipeline session…" />
			)}

			{!report && hasOtherError && (
				<>
					{backLink}
					<ErrorState
						error={reportQuery.error}
						message="Could not load pipeline session."
						onRetry={() => {
							void reportQuery.refetch();
						}}
					/>
				</>
			)}

			{report && (
				<>
					<SessionSummaryCard now={now} report={report} />

					<StepsCard now={now} report={report} />
				</>
			)}

			<ConfirmDialog
				confirmLabel="Stop session"
				description="The session will be stopped immediately. Any in-progress steps may be interrupted."
				destructive
				isPending={stopPending}
				onClose={() => {
					if (!stopPending) setShowStopConfirm(false);
				}}
				onConfirm={handleConfirmStop}
				open={showStopConfirm}
				title="Stop pipeline session?"
			/>
		</PageRail>
	);
}

function StepsCard({ now, report }: { now: number; report: PipelineSessionReport }) {
	const rows = buildStepRows(report);
	const singleStep = rows.length === 1;
	return (
		<section aria-labelledby="execution-heading" className="flex flex-col gap-3">
			{singleStep ? (
				<h2 className="sr-only" id="execution-heading">
					Execution
				</h2>
			) : (
				<div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
					<h2 className={sectionCaptionClass} id="execution-heading">
						Steps
					</h2>
					<p className="text-sm text-muted-foreground">
						{pipelineSessionStepSummary(report.session)}
					</p>
				</div>
			)}
			<div>
				{rows.map((row) =>
					row.kind === 'executed' ? (
						<ExecutedStepRow
							attemptLabel={row.attemptLabel}
							key={`exec-${row.result.id}`}
							now={now}
							parentStepName={row.parentStepName}
							sessionErrorMessage={report.session.errorMessage}
							step={row.result}
							suppressName={
								singleStep && row.result.stepName === report.session.recipeName
							}
							suppressTiming={singleStep}
							totalSteps={report.session.totalSteps}
						/>
					) : (
						<PendingStepRow
							key={`pending-${row.sequenceNumber}`}
							sequenceNumber={row.sequenceNumber}
							step={row.step}
							totalSteps={report.session.totalSteps}
						/>
					),
				)}
			</div>
		</section>
	);
}
