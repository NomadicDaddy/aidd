import { default as ChevronDown } from 'lucide-react/dist/esm/icons/chevron-down';
import { default as ChevronRight } from 'lucide-react/dist/esm/icons/chevron-right';
import { default as CircleStop } from 'lucide-react/dist/esm/icons/circle-stop';
import { default as FileText } from 'lucide-react/dist/esm/icons/file-text';
import { default as Workflow } from 'lucide-react/dist/esm/icons/workflow';
import { Link } from 'react-router';

import type { PipelineSessionRecord } from '../../api/types.ts';

import { Badge } from '../../components/ui/badge.tsx';
import { Button, buttonClassName, IconButton } from '../../components/ui/button.tsx';
import { cn } from '../../lib/cn.ts';
import { traceDataMovement } from '../../lib/dataMovementTrace.ts';
import { formatActiveDuration, formatDate } from '../../lib/formatters.ts';
import { ConsoleSelectionButton, ProjectDetailLink } from './ExecutionRowLinks.tsx';
import { PipelineSessionIdentityBadges } from './PipelineSessionIdentityBadges.tsx';
import {
	isSessionActive,
	sessionStatusLabel,
	sessionStatusTone,
	sessionStopUnavailableReason,
} from './pipelineSessionStatus.ts';
import {
	containerHoverClass,
	containerSelectableClass,
	containerSelectionHandler,
} from './runRowUtils.ts';
import { isMultiStepSession, isSkillSession } from './unifiedEntries.ts';

interface PipelineSessionRowProps {
	expanded: boolean;
	now: number;
	onSelect: (id: string) => void;
	onStop: (id: string) => void;
	onToggle: (id: string) => void;
	projectRouteId: string | undefined;
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
	onSelect,
	onToggle,
	selected,
	session,
}: Pick<PipelineSessionRowProps, 'expanded' | 'onSelect' | 'onToggle' | 'selected' | 'session'>) {
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
			<ConsoleSelectionButton
				className="whitespace-nowrap"
				label={`Show ${session.recipeName} pipeline in Live Console`}
				onSelect={() => selectSession(onSelect, session)}
				selected={selected}>
				{session.recipeName}
			</ConsoleSelectionButton>
			{multiStep && (
				<span
					className="font-mono text-xs text-muted-foreground"
					title={`Step ${session.currentStepIndex} of ${session.totalSteps}`}>
					{session.currentStepIndex}/{session.totalSteps}
				</span>
			)}
		</div>
	);
}

function selectSession(onSelect: (id: string) => void, session: PipelineSessionRecord): void {
	traceDataMovement({
		category: 'event',
		layer: 'ui',
		operation: 'runs.console.select',
		source: 'RunsPage',
		summary: { sessionId: session.id },
	});
	onSelect(session.id);
}

function SessionProjectLink({
	projectRouteId,
	session,
}: Pick<PipelineSessionRowProps, 'projectRouteId' | 'session'>) {
	if (projectRouteId === undefined) {
		return <span className="text-muted-foreground">{session.projectName}</span>;
	}
	return (
		<ProjectDetailLink
			href={`/projects/${encodeURIComponent(projectRouteId)}`}
			label={`Open ${session.projectName} project details`}
			name={session.projectName}
		/>
	);
}

function SessionMeta({
	projectRouteId,
	session,
}: Pick<PipelineSessionRowProps, 'projectRouteId' | 'session'>) {
	return (
		<div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
			<Badge tone="teal">{isSkillSession(session) ? 'Skill' : 'Pipeline'}</Badge>
			<PipelineSessionIdentityBadges identities={session.executionIdentities} />
			<SessionProjectLink projectRouteId={projectRouteId} session={session} />
			<span>{formatDate(session.startedAt)}</span>
		</div>
	);
}

const selectedRowClass = 'bg-teal-100/80 shadow-[inset_4px_0_0_var(--accent)] dark:bg-teal-900/40';

export function PipelineSessionRow(props: PipelineSessionRowProps) {
	const { now, onSelect, selected, session } = props;
	return (
		<tr
			aria-selected={selected}
			className={cn(
				'border-b transition-colors last:border-0',
				containerSelectableClass,
				selected ? selectedRowClass : containerHoverClass,
			)}
			onClick={containerSelectionHandler(() => selectSession(onSelect, session))}>
			<td className="py-3 pr-3 pl-4">
				<SessionTitle {...props} />
				<div className="mt-1 text-xs text-muted-foreground">
					{formatDate(session.startedAt)}
				</div>
			</td>
			<td className="px-3 py-3">
				<SessionProjectLink {...props} />
			</td>
			<td className="px-3 py-3">
				<Badge tone="teal">{isSkillSession(session) ? 'Skill' : 'Pipeline'}</Badge>
			</td>
			<td className="px-3 py-3">
				<PipelineSessionIdentityBadges identities={session.executionIdentities} />
			</td>
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
	const { now, onSelect, selected, session } = props;
	return (
		<div
			aria-selected={selected}
			className={cn(
				'px-4 py-3 transition-colors',
				containerSelectableClass,
				selected ? selectedRowClass : containerHoverClass,
			)}
			onClick={containerSelectionHandler(() => selectSession(onSelect, session))}
			role="listitem">
			<SessionTitle {...props} />
			<SessionMeta projectRouteId={props.projectRouteId} session={session} />
			<div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
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
