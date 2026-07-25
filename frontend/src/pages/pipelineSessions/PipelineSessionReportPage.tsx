import {
	isSkillExecutionIntent,
	skillExecutionIntentLabel,
} from 'aidd-shared/skill-execution-intent';
import { default as ArrowLeft } from 'lucide-react/dist/esm/icons/arrow-left';
import { default as CircleStop } from 'lucide-react/dist/esm/icons/circle-stop';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import type { PipelineSessionReport } from '../../api/types.ts';

import { ApiError } from '../../api/client.ts';
import { ConfirmDialog } from '../../components/shared/ConfirmDialog.tsx';
import { ErrorState } from '../../components/shared/ErrorState.tsx';
import { LoadingState } from '../../components/shared/LoadingState.tsx';
import { PageHeader } from '../../components/shared/PageHeader.tsx';
import { Badge } from '../../components/ui/badge.tsx';
import { Button, buttonClassName } from '../../components/ui/button.tsx';
import { Card } from '../../components/ui/card.tsx';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.ts';
import { useNow } from '../../hooks/useNow.ts';
import { usePipelineSessionReport, usePipelineSessions } from '../../hooks/usePipelineSessions.ts';
import { formatActiveDuration, formatDate } from '../../lib/formatters.ts';
import { buildStepRows, ExecutedStepRow, PendingStepRow } from './StepRows.tsx';

function sessionTone(status: PipelineSessionReport['session']['status']) {
	if (status === 'completed') return 'emerald';
	if (status === 'failed') return 'red';
	if (status === 'running' || status === 'queued') return 'teal';
	return 'amber';
}

function sessionStatusLabel(status: PipelineSessionReport['session']['status']): string {
	return status === 'completed_with_failures' ? 'completed with failures' : status;
}

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
		report ? `${report.session.recipeName} · Pipeline Sessions` : 'Pipeline Session'
	);
	const notFound = reportQuery.error instanceof ApiError && reportQuery.error.status === 404;
	const hasOtherError = reportQuery.error !== null && !notFound;

	if (!id) return null;

	const backLink = (
		<Link
			className="inline-flex items-center gap-2 text-sm text-neutral-600 hover:text-neutral-950"
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
					<h1 className="text-foreground text-xl font-semibold">
						Pipeline session not found
					</h1>
					<p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">
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
		<div className="page-reveal space-y-5">
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
				breadcrumb={
					<Link className="hover:underline" to="/runs">
						Runs
					</Link>
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

					<StepsCard report={report} />
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
		</div>
	);
}

function SessionSummaryCard({ now, report }: { now: number; report: PipelineSessionReport }) {
	const skillIntents = report.recipeSteps.flatMap((step) => {
		const intent = step.configJson.executionIntent;
		return step.stepType === 'skill' && isSkillExecutionIntent(intent) ? [intent] : [];
	});
	return (
		<Card className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
			<div>
				<p className="text-xs font-medium text-neutral-500 uppercase">Status</p>
				<Badge className="mt-2" tone={sessionTone(report.session.status)}>
					{sessionStatusLabel(report.session.status)}
				</Badge>
				{report.session.errorMessage && (
					<p
						className={`mt-2 text-sm ${
							report.session.status === 'completed_with_failures'
								? 'text-amber-700 dark:text-amber-300'
								: 'text-red-700 dark:text-red-300'
						}`}>
						{report.session.errorMessage}
					</p>
				)}
			</div>
			{skillIntents.length > 0 ? (
				<div>
					<p className="text-xs font-medium text-neutral-500 uppercase">
						Skill directive intent
					</p>
					<div className="mt-2 flex flex-wrap gap-1.5">
						{[...new Set(skillIntents)].map((intent) => (
							<Badge key={intent} tone={intent === 'review-only' ? 'teal' : 'amber'}>
								{skillExecutionIntentLabel(intent)}
							</Badge>
						))}
					</div>
					<p className="mt-1 text-xs text-neutral-500">
						Skill steps are directive runs, not audits. Review-only is
						instruction-enforced.
					</p>
				</div>
			) : null}
			<div>
				<p className="text-xs font-medium text-neutral-500 uppercase">Project</p>
				<p className="mt-2 text-sm text-neutral-700 dark:text-neutral-200">
					{report.session.projectName}
				</p>
			</div>
			<div>
				<p className="text-xs font-medium text-neutral-500 uppercase">Started</p>
				<p className="mt-2 text-sm text-neutral-700 dark:text-neutral-200">
					{formatDate(report.session.startedAt)}
				</p>
			</div>
			<div>
				<p className="text-xs font-medium text-neutral-500 uppercase">Duration</p>
				<p className="mt-2 text-sm text-neutral-700 dark:text-neutral-200">
					{formatActiveDuration(report.session.durationMs, report.session.startedAt, now)}
				</p>
			</div>
			<div>
				<p className="text-xs font-medium text-neutral-500 uppercase">Progress</p>
				<p className="mt-2 text-sm text-neutral-700 dark:text-neutral-200">
					Step {report.session.currentStepIndex} of {report.session.totalSteps}
				</p>
			</div>
		</Card>
	);
}

function stepSummary(report: PipelineSessionReport): string {
	const rows = buildStepRows(report);
	const executed = rows.filter((r) => r.kind === 'executed').length;
	const pending = rows.length - executed;
	const isactive = report.session.status === 'running' || report.session.status === 'queued';
	const current = isactive ? report.session.currentStepIndex + 1 : null;
	if (current) {
		return `${executed} done · on step ${current} of ${rows.length} · ${pending} remaining`;
	}
	const suffix = pending > 0 ? ` · ${pending} not reached` : '';
	return `${executed} of ${rows.length} steps${suffix}`;
}

function StepsCard({ report }: { report: PipelineSessionReport }) {
	return (
		<Card className="space-y-3">
			<h2 className="text-foreground text-lg font-semibold">Steps</h2>
			<p className="text-sm text-neutral-600 dark:text-neutral-300">{stepSummary(report)}</p>
			<div className="space-y-3">
				{buildStepRows(report).map((row) =>
					row.kind === 'executed' ? (
						<ExecutedStepRow key={`exec-${row.result.id}`} step={row.result} />
					) : (
						<PendingStepRow
							key={`pending-${row.sequenceNumber}`}
							sequenceNumber={row.sequenceNumber}
							step={row.step}
							totalSteps={report.session.totalSteps}
						/>
					)
				)}
			</div>
		</Card>
	);
}
