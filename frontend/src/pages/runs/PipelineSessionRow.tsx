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
import { toneText } from '../../lib/tones.ts';
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
	containerSelectedClass,
	containerSelectionHandler,
	failureReasonClass,
	leadingSlotClass,
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
	/** See UnifiedExecutionTableProps: `false` drops the never-enabled Stop from History rows. */
	showLifecycleControls: boolean;
}

function SessionActions({
	onStop,
	session,
	showLifecycleControls,
}: Pick<PipelineSessionRowProps, 'onStop' | 'session' | 'showLifecycleControls'>) {
	const sessionContext = `${session.recipeName} (${session.projectName})`;
	const stopBlockedReason = sessionStopUnavailableReason(session.status);
	return (
		// Two 32px controls plus an 8px gap fit the ACTIONS cell at every width the table renders at;
		// left wrappable they stacked at 768 and every session row grew to double the height of the
		// single-control run rows beside it.
		<div className="flex flex-nowrap gap-2">
			<Link
				aria-label={`View report for ${sessionContext}`}
				className={cn(buttonClassName('secondary', 'h-8 w-8', 'icon'), 'shrink-0')}
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
			{showLifecycleControls ? (
				<IconButton
					ariaLabel={
						stopBlockedReason !== null
							? `${stopBlockedReason} for ${sessionContext}`
							: `Stop session: ${sessionContext}`
					}
					className="h-8 w-8 shrink-0"
					disabled={!isSessionActive(session.status)}
					onClick={() => onStop(session.id)}
					title={stopBlockedReason ?? 'Stop session'}
					variant="danger">
					<CircleStop aria-hidden="true" className="h-3.5 w-3.5" />
				</IconButton>
			) : null}
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
			{/* The leading slot and the name are one group that cannot wrap internally: as separate
			    wrappable items the teal icon was left orphaned on its own line with a long recipe
			    name dropping beneath it. The slot is a fixed 24px on every row type — chevron for a
			    multi-step session, Workflow icon otherwise, empty on run rows — so the whole NAME
			    column shares one left edge instead of zig-zagging by row type. */}
			<div className="flex min-w-0 items-center gap-2">
				<span className={leadingSlotClass}>
					{multiStep ? (
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
					) : (
						<Workflow aria-hidden="true" className="h-4 w-4 text-accent" />
					)}
				</span>
				<ConsoleSelectionButton
					className="truncate"
					label={`Show ${session.recipeName} pipeline in Live Console`}
					onSelect={() => selectSession(onSelect, session)}
					selected={selected}>
					{session.recipeName}
				</ConsoleSelectionButton>
			</div>
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
			<Badge tone="neutral">{isSkillSession(session) ? 'Skill' : 'Pipeline'}</Badge>
			<PipelineSessionIdentityBadges identities={session.executionIdentities} />
			<SessionProjectLink projectRouteId={projectRouteId} session={session} />
			<span>{formatDate(session.startedAt)}</span>
		</div>
	);
}

export function PipelineSessionRow(props: PipelineSessionRowProps) {
	const { now, onSelect, selected, session } = props;
	return (
		<tr
			aria-selected={selected}
			className={cn(
				'border-b transition-colors last:border-0',
				containerSelectableClass,
				selected ? containerSelectedClass : containerHoverClass,
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
				<Badge tone="neutral">{isSkillSession(session) ? 'Skill' : 'Pipeline'}</Badge>
			</td>
			{/* The desktop MODEL cell has a fixed budget and a session can carry more than one
			    runtime, so this is the cell that produced `co…  gpt-5…  hi…`. The wrapping meta
			    line on the mobile card has no such budget and keeps the full labels. */}
			<td className="px-3 py-3">
				<PipelineSessionIdentityBadges
					identities={session.executionIdentities}
					variant="compact"
				/>
			</td>
			<td className="px-3 py-3">
				<Badge tone={sessionStatusTone(session.status)}>
					{sessionStatusLabel(session.status)}
				</Badge>
				{session.errorMessage && (
					<p
						className={`${failureReasonClass} ${toneText.red}`}
						title={session.errorMessage}>
						{session.errorMessage}
					</p>
				)}
			</td>
			<td className="px-3 py-3 whitespace-nowrap">
				{formatActiveDuration(session.durationMs, session.startedAt, now)}
			</td>
			<td className="py-3 pr-4 pl-3">
				<SessionActions
					onStop={props.onStop}
					session={session}
					showLifecycleControls={props.showLifecycleControls}
				/>
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
				selected ? containerSelectedClass : containerHoverClass,
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
				<p className={`mt-1 text-xs ${toneText.red}`} title={session.errorMessage}>
					{session.errorMessage}
				</p>
			)}
			<div className="mt-2">
				<SessionActions
					onStop={props.onStop}
					session={session}
					showLifecycleControls={props.showLifecycleControls}
				/>
			</div>
		</div>
	);
}
