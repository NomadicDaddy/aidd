/* eslint-disable react-refresh/only-export-components */
import { default as ChevronDown } from 'lucide-react/dist/esm/icons/chevron-down';
import { default as ChevronRight } from 'lucide-react/dist/esm/icons/chevron-right';
import { default as CircleStop } from 'lucide-react/dist/esm/icons/circle-stop';
import { default as FileText } from 'lucide-react/dist/esm/icons/file-text';
import { default as Workflow } from 'lucide-react/dist/esm/icons/workflow';
import { type KeyboardEvent, type MouseEvent } from 'react';
import { Link } from 'react-router-dom';

import type { PipelineSessionRecord } from '../../api/types.ts';

import { Badge } from '../../components/ui/badge.tsx';
import { Button, buttonClassName, IconButton } from '../../components/ui/button.tsx';
import { cn } from '../../lib/cn.ts';
import { traceDataMovement } from '../../lib/dataMovementTrace.ts';
import { formatActiveDuration, formatDate } from '../../lib/formatters.ts';
import { isMultiStepSession, isSkillSession } from './unifiedEntries.ts';

export function sessionStatusTone(status: PipelineSessionRecord['status']) {
	if (status === 'completed') return 'emerald';
	if (status === 'failed') return 'red';
	if (status === 'running' || status === 'queued') return 'teal';
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
				className={buttonClassName('secondary', 'h-8 w-8', 'icon')}
				onClick={() =>
					traceDataMovement({
						category: 'event',
						layer: 'ui',
						operation: 'pipeline.report.navigate',
						source: 'RunsPage',
						summary: { sessionId: session.id },
					})
				}
				title="Report"
				to={`/pipeline-sessions/${session.id}`}>
				<FileText aria-hidden="true" className="h-3.5 w-3.5" />
			</Link>
			<IconButton
				ariaLabel={
					stopBlockedReason !== null
						? `${stopBlockedReason} for ${sessionContext}`
						: `Stop session: ${sessionContext}`
				}
				className="h-8 w-8"
				disabled={!isSessionActive(session.status)}
				onClick={() => onStop(session.id)}
				title={stopBlockedReason ?? 'Stop session'}
				variant="danger">
				<CircleStop aria-hidden="true" className="h-3.5 w-3.5" />
			</IconButton>
		</div>
	);
}

function SessionTitle({
	expanded,
	onToggle,
	session,
}: Pick<PipelineSessionRowProps, 'expanded' | 'onToggle' | 'session'>) {
	// Single-step pipelines don't nest: no chevron, no step chip — the row stands alone.
	const multiStep = isMultiStepSession(session);
	return (
		<div className="flex flex-wrap items-center gap-x-2 gap-y-1">
			{multiStep && (
				<Button
					aria-expanded={expanded}
					aria-label={`${expanded ? 'Collapse' : 'Expand'} steps for ${session.recipeName}`}
					className="px-1"
					onClick={() => onToggle(session.id)}
					size="compact"
					variant="ghost">
					{expanded ? (
						<ChevronDown aria-hidden="true" className="h-3.5 w-3.5" />
					) : (
						<ChevronRight aria-hidden="true" className="h-3.5 w-3.5" />
					)}
				</Button>
			)}
			<Workflow
				aria-hidden="true"
				className="h-4 w-4 shrink-0 text-teal-600 dark:text-teal-400"
			/>
			<Link
				className="font-medium whitespace-nowrap text-teal-700 underline-offset-2 hover:underline dark:text-teal-300"
				to={`/pipeline-sessions/${session.id}`}>
				{session.recipeName}
			</Link>
			{multiStep && (
				<span
					className="font-mono text-xs text-neutral-500"
					title={`Step ${session.currentStepIndex} of ${session.totalSteps}`}>
					{session.currentStepIndex}/{session.totalSteps}
				</span>
			)}
		</div>
	);
}

// The whole row/card is the "show in Live Console" target (there is no Console button). Clicks
// on interactive children (links, buttons) keep their own behavior.
function sessionSelectHandler(
	onSelect: (id: string) => void,
	session: PipelineSessionRecord
): (event: KeyboardEvent | MouseEvent) => void {
	return (event) => {
		if ((event.target as HTMLElement).closest('a,button')) return;
		traceDataMovement({
			category: 'event',
			layer: 'ui',
			operation: 'runs.console.select',
			source: 'RunsPage',
			summary: { sessionId: session.id },
		});
		onSelect(session.id);
	};
}

function sessionRowAriaLabel(selected: boolean, session: PipelineSessionRecord): string {
	return selected
		? `${session.recipeName} pipeline selected in Live Console`
		: `Show ${session.recipeName} pipeline in Live Console`;
}

function SessionMeta({ session }: { session: PipelineSessionRecord }) {
	return (
		<div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-neutral-500">
			<Badge tone="teal">{isSkillSession(session) ? 'Skill' : 'Pipeline'}</Badge>
			<span>{session.projectName}</span>
			<span>{formatDate(session.startedAt)}</span>
		</div>
	);
}

const selectedRowClass = 'bg-teal-100/80 shadow-[inset_4px_0_0_var(--accent)] dark:bg-teal-900/40';

export function PipelineSessionRow(props: PipelineSessionRowProps) {
	const { now, selected, session } = props;
	const selectFromRow = sessionSelectHandler(props.onSelect, session);
	return (
		<tr
			aria-label={sessionRowAriaLabel(selected, session)}
			aria-selected={selected}
			className={cn(
				'cursor-pointer border-b transition-colors last:border-0',
				selected ? selectedRowClass : 'hover:bg-neutral-50 dark:hover:bg-neutral-900/50'
			)}
			onClick={selectFromRow}
			onKeyDown={(event) => {
				if (event.target !== event.currentTarget) return;
				if (event.key !== 'Enter' && event.key !== ' ') return;
				event.preventDefault();
				selectFromRow(event);
			}}
			tabIndex={0}
			title="Show in Live Console">
			<td className="py-3 pr-3 pl-4">
				<SessionTitle {...props} />
				<div className="mt-1 text-xs text-neutral-500">{formatDate(session.startedAt)}</div>
			</td>
			<td className="px-3 py-3">{session.projectName}</td>
			<td className="px-3 py-3">
				<Badge tone="teal">{isSkillSession(session) ? 'Skill' : 'Pipeline'}</Badge>
			</td>
			<td className="px-3 py-3 text-neutral-400 dark:text-neutral-600">—</td>
			<td className="px-3 py-3">
				<Badge tone={sessionStatusTone(session.status)}>
					{sessionStatusLabel(session.status)}
				</Badge>
				{session.errorMessage && (
					<p className="mt-1 max-w-[16rem] truncate text-xs text-red-700 dark:text-red-300">
						{session.errorMessage}
					</p>
				)}
			</td>
			<td className="px-3 py-3 whitespace-nowrap">
				{formatActiveDuration(session.durationMs, session.startedAt, now)}
			</td>
			<td className="py-3 pr-4 pl-3">
				<SessionActions onStop={props.onStop} session={session} />
			</td>
		</tr>
	);
}

export function PipelineSessionMobileCard(props: PipelineSessionRowProps) {
	const { now, selected, session } = props;
	const selectFromCard = sessionSelectHandler(props.onSelect, session);
	return (
		<div
			aria-label={sessionRowAriaLabel(selected, session)}
			aria-selected={selected}
			className={cn('cursor-pointer px-4 py-3', selected && selectedRowClass)}
			onClick={selectFromCard}
			onKeyDown={(event) => {
				if (event.target !== event.currentTarget) return;
				if (event.key !== 'Enter' && event.key !== ' ') return;
				event.preventDefault();
				selectFromCard(event);
			}}
			role="listitem"
			tabIndex={0}
			title="Show in Live Console">
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
