import { default as ChevronDown } from 'lucide-react/dist/esm/icons/chevron-down';
import { default as CircleStop } from 'lucide-react/dist/esm/icons/circle-stop';
import { default as FileText } from 'lucide-react/dist/esm/icons/file-text';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import type { PipelineSessionRecord } from '../../api/types.ts';

import { EmptyState } from '../../components/shared/EmptyState.tsx';
import { PageHeader } from '../../components/shared/PageHeader.tsx';
import { Badge } from '../../components/ui/badge.tsx';
import { Button, buttonClassName } from '../../components/ui/button.tsx';
import { Card } from '../../components/ui/card.tsx';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.ts';
import { useNow } from '../../hooks/useNow.ts';
import { usePipelineSessions } from '../../hooks/usePipelineSessions.ts';
import { traceDataMovement } from '../../lib/dataMovementTrace.ts';
import { formatActiveDuration, formatDate } from '../../lib/formatters.ts';

function statusTone(status: PipelineSessionRecord['status']) {
	if (status === 'completed') return 'emerald';
	if (status === 'failed') return 'red';
	if (status === 'running' || status === 'queued') return 'cyan';
	return 'amber';
}

function statusLabel(status: PipelineSessionRecord['status']): string {
	return status === 'completed_with_failures' ? 'completed with failures' : status;
}

function isActive(status: PipelineSessionRecord['status']): boolean {
	return status === 'queued' || status === 'running';
}

function stopUnavailableReason(status: PipelineSessionRecord['status']): null | string {
	if (status === 'completed') return 'Stop unavailable: session completed';
	if (status === 'failed') return 'Stop unavailable: session failed';
	if (status === 'stopped') return 'Stop unavailable: session already stopped';
	if (status === 'completed_with_failures')
		return 'Stop unavailable: session completed with failures';
	return null;
}

export function PipelineSessionsPage() {
	useDocumentTitle('Pipeline Sessions');
	const pipelineSessions = usePipelineSessions();
	const sessionsQuery = pipelineSessions.sessions;
	const sessions = sessionsQuery.data?.pages.flatMap((page) => page.sessions) ?? [];
	const now = useNow(sessions.some((session) => isActive(session.status)));

	return (
		<div className="space-y-5">
			<PageHeader
				description="Recipe launches and their persisted step history."
				helpSlug="pipelines"
				title="Pipeline Sessions"
			/>

			<Card>
				{sessions.length === 0 ? (
					<EmptyState
						action={
							<Link className={buttonClassName('secondary')} to="/recipes">
								Browse recipes to launch
							</Link>
						}>
						No pipeline sessions yet. Launch a recipe from the Recipes page to start
						one.
					</EmptyState>
				) : (
					<div className="space-y-3">
						{sessions.map((session) => {
							const sessionContext = `${session.recipeName} (${session.projectName})`;
							const stopBlockedReason = stopUnavailableReason(session.status);
							const stopAriaLabel =
								stopBlockedReason !== null
									? `${stopBlockedReason} for ${sessionContext}`
									: `Stop session: ${sessionContext}`;
							return (
								<div
									className="grid gap-3 rounded-md border border-neutral-200 p-4 lg:grid-cols-[1fr_auto] dark:border-neutral-800"
									key={session.id}>
									<div className="min-w-0">
										<div className="mb-2 flex flex-wrap items-center gap-2">
											<Link
												className="font-semibold text-neutral-950 hover:underline dark:text-neutral-50"
												to={`/pipeline-sessions/${session.id}`}>
												{session.recipeName}
											</Link>
											<Badge tone={statusTone(session.status)}>
												{statusLabel(session.status)}
											</Badge>
										</div>
										<div className="grid gap-2 text-sm text-neutral-600 md:grid-cols-4 dark:text-neutral-300">
											<span>{session.projectName}</span>
											<span>{formatDate(session.startedAt)}</span>
											<span>
												{formatActiveDuration(
													session.durationMs,
													session.startedAt,
													now
												)}
											</span>
											<span>
												{session.currentStepIndex}/{session.totalSteps}{' '}
												steps
											</span>
										</div>
										{session.errorMessage && (
											<p className="mt-2 text-sm text-red-700 dark:text-red-300">
												{session.errorMessage}
											</p>
										)}
									</div>
									<div className="flex flex-wrap items-start gap-2">
										<Link
											aria-label={`View report for ${sessionContext}`}
											className={buttonClassName()}
											onClick={() =>
												traceDataMovement({
													category: 'event',
													layer: 'ui',
													operation: 'pipeline.report.navigate',
													source: 'PipelineSessionsPage',
													summary: { sessionId: session.id },
												})
											}
											to={`/pipeline-sessions/${session.id}`}>
											<FileText aria-hidden="true" className="h-4 w-4" />
											Report
										</Link>
										<Button
											aria-label={stopAriaLabel}
											disabled={!isActive(session.status)}
											onClick={() => {
												traceDataMovement({
													category: 'event',
													layer: 'ui',
													operation: 'pipeline.stop',
													source: 'PipelineSessionsPage',
													summary: { sessionId: session.id },
													target: '/api/v1/pipeline-sessions/:id/stop',
												});
												pipelineSessions.stopSession.mutate(session.id, {
													onSuccess: () =>
														toast.success('Session stopped'),
												});
											}}
											title={stopBlockedReason ?? undefined}
											variant="danger">
											<CircleStop aria-hidden="true" className="h-4 w-4" />
											Stop
										</Button>
									</div>
								</div>
							);
						})}
					</div>
				)}
				{sessionsQuery.hasNextPage ? (
					<div className="mt-4 flex justify-center">
						<Button
							disabled={sessionsQuery.isFetchingNextPage}
							onClick={() => void sessionsQuery.fetchNextPage()}
							variant="secondary">
							<ChevronDown aria-hidden="true" className="h-4 w-4" />
							{sessionsQuery.isFetchingNextPage ? 'Loading…' : 'Show more'}
						</Button>
					</div>
				) : null}
			</Card>
		</div>
	);
}
