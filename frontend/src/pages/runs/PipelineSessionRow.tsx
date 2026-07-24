/* eslint-disable react-refresh/only-export-components */
import { default as ChevronDown } from 'lucide-react/dist/esm/icons/chevron-down';
import { default as ChevronRight } from 'lucide-react/dist/esm/icons/chevron-right';
import { default as CircleStop } from 'lucide-react/dist/esm/icons/circle-stop';
import { default as FileText } from 'lucide-react/dist/esm/icons/file-text';
import { default as Terminal } from 'lucide-react/dist/esm/icons/terminal';
import { default as Workflow } from 'lucide-react/dist/esm/icons/workflow';
import { Link } from 'react-router-dom';

import type { PipelineSessionRecord } from '../../api/types.ts';

import { Badge } from '../../components/ui/badge.tsx';
import { Button, buttonClassName } from '../../components/ui/button.tsx';
import { cn } from '../../lib/cn.ts';
import { traceDataMovement } from '../../lib/dataMovementTrace.ts';
import { formatActiveDuration, formatDate } from '../../lib/formatters.ts';

export function sessionStatusTone(status: PipelineSessionRecord['status']) {
	if (status === 'completed') return 'emerald';
	if (status === 'failed') return 'red';
	if (status === 'running' || status === 'queued') return 'cyan';
	return 'amber';
}

export function sessionStatusLabel(status: PipelineSessionRecord['status']): string {
	return status === 'completed_with_failures' ? 'completed with failures' : status;
}

export function isSessionActive(status: PipelineSessionRecord['status']): boolean {
	return status === 'queued' || status === 'running';
}

export function sessionStopUnavailableReason(
	status: PipelineSessionRecord['status']
): null | string {
	if (status === 'completed') return 'Stop unavailable: session completed';
	if (status === 'failed') return 'Stop unavailable: session failed';
	if (status === 'stopped') return 'Stop unavailable: session already stopped';
	if (status === 'completed_with_failures')
		return 'Stop unavailable: session completed with failures';
	return null;
}

interface PipelineSessionRowProps {
	expanded: boolean;
	now: number;
	onSelect: (id: string) => void;
	onStop: (id: string) => void;
	onToggle: (id: string) => void;
	selected: boolean;
	session: PipelineSessionRecord;
}

function SessionActions({ onStop, session }: Pick<PipelineSessionRowProps, 'onStop' | 'session'>) {
	const sessionContext = `${session.recipeName} (${session.projectName})`;
	const stopBlockedReason = sessionStopUnavailableReason(session.status);
	return (
		<div className="flex flex-wrap gap-2">
			<Link
				aria-label={`View report for ${sessionContext}`}
				className={buttonClassName('secondary', undefined, 'compact')}
				onClick={() =>
					traceDataMovement({
						category: 'event',
						layer: 'ui',
						operation: 'pipeline.report.navigate',
						source: 'RunsPage',
						summary: { sessionId: session.id },
					})
				}
				to={`/pipeline-sessions/${session.id}`}>
				<FileText aria-hidden="true" className="h-3.5 w-3.5" />
				Report
			</Link>
			<Button
				aria-label={
					stopBlockedReason !== null
						? `${stopBlockedReason} for ${sessionContext}`
						: `Stop session: ${sessionContext}`
				}
				disabled={!isSessionActive(session.status)}
				onClick={() => onStop(session.id)}
				size="compact"
				title={stopBlockedReason ?? undefined}
				variant="danger">
				<CircleStop aria-hidden="true" className="h-3.5 w-3.5" />
				Stop
			</Button>
		</div>
	);
}

function SessionTitle({
	expanded,
	onSelect,
	onToggle,
	selected,
	session,
}: Omit<PipelineSessionRowProps, 'now' | 'onStop'>) {
	return (
		<div className="flex items-center gap-2">
			<Button
				aria-expanded={expanded}
				aria-label={`${expanded ? 'Collapse' : 'Expand'} steps for ${session.recipeName}`}
				onClick={() => onToggle(session.id)}
				size="compact"
				variant="ghost">
				{expanded ? (
					<ChevronDown aria-hidden="true" className="h-3.5 w-3.5" />
				) : (
					<ChevronRight aria-hidden="true" className="h-3.5 w-3.5" />
				)}
			</Button>
			<Workflow
				aria-hidden="true"
				className="h-4 w-4 shrink-0 text-cyan-600 dark:text-cyan-400"
			/>
			<Link
				className="font-medium text-cyan-700 underline-offset-2 hover:underline dark:text-cyan-300"
				to={`/pipeline-sessions/${session.id}`}>
				{session.recipeName}
			</Link>
			<Button
				aria-label={
					selected
						? `${session.recipeName} pipeline selected in Live Console`
						: `Show ${session.recipeName} pipeline in Live Console`
				}
				aria-pressed={selected}
				onClick={() => {
					traceDataMovement({
						category: 'event',
						layer: 'ui',
						operation: 'runs.console.select',
						source: 'RunsPage',
						summary: { sessionId: session.id },
					});
					onSelect(session.id);
				}}
				size="compact"
				title="Show in Live Console"
				variant={selected ? 'primary' : 'secondary'}>
				<Terminal aria-hidden="true" className="h-3.5 w-3.5" />
				Console
			</Button>
		</div>
	);
}

function SessionMeta({ session }: { session: PipelineSessionRecord }) {
	return (
		<div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-neutral-500">
			<Badge tone="cyan">Pipeline</Badge>
			<span>{session.projectName}</span>
			<span>{formatDate(session.startedAt)}</span>
			<span>
				{session.currentStepIndex}/{session.totalSteps} steps
			</span>
		</div>
	);
}

const selectedRowClass =
	'bg-cyan-100/80 shadow-[inset_4px_0_0_rgb(8,145,178)] dark:bg-cyan-900/40 dark:shadow-[inset_4px_0_0_rgb(34,211,238)]';

export function PipelineSessionRow(props: PipelineSessionRowProps) {
	const { now, selected, session } = props;
	return (
		<tr
			aria-selected={selected}
			className={cn(
				'border-b transition-colors last:border-0',
				selected ? selectedRowClass : 'hover:bg-neutral-50 dark:hover:bg-neutral-900/50'
			)}>
			<td className="px-4 py-3">
				<SessionTitle {...props} />
				<SessionMeta session={session} />
			</td>
			<td className="px-4 py-3">
				<Badge tone={sessionStatusTone(session.status)}>
					{sessionStatusLabel(session.status)}
				</Badge>
				{session.errorMessage && (
					<p className="mt-1 max-w-[16rem] truncate text-xs text-red-700 dark:text-red-300">
						{session.errorMessage}
					</p>
				)}
			</td>
			<td className="px-4 py-3">
				{formatActiveDuration(session.durationMs, session.startedAt, now)}
			</td>
			<td className="px-4 py-3">
				<SessionActions onStop={props.onStop} session={session} />
			</td>
		</tr>
	);
}

export function PipelineSessionMobileCard(props: PipelineSessionRowProps) {
	const { now, selected, session } = props;
	return (
		<div
			aria-selected={selected}
			className={cn('px-4 py-3', selected && selectedRowClass)}
			role="listitem">
			<SessionTitle {...props} />
			<SessionMeta session={session} />
			<div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
				<Badge tone={sessionStatusTone(session.status)}>
					{sessionStatusLabel(session.status)}
				</Badge>
				<span>{formatActiveDuration(session.durationMs, session.startedAt, now)}</span>
			</div>
			{session.errorMessage && (
				<p className="mt-1 text-xs text-red-700 dark:text-red-300">
					{session.errorMessage}
				</p>
			)}
			<div className="mt-2">
				<SessionActions onStop={props.onStop} session={session} />
			</div>
		</div>
	);
}
