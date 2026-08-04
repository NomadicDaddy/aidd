import { default as Loader2 } from 'lucide-react/dist/esm/icons/loader-2';
import { default as Play } from 'lucide-react/dist/esm/icons/play';
import { default as Square } from 'lucide-react/dist/esm/icons/square';
import { default as X } from 'lucide-react/dist/esm/icons/x';

import type { RunRecord } from '../../api/types.ts';

import { ExecutionIdentityBadges } from '../../components/shared/ExecutionIdentityBadges.tsx';
import { RunCommandInfo } from '../../components/shared/RunCommandInfo.tsx';
import { Badge } from '../../components/ui/badge.tsx';
import { Button } from '../../components/ui/button.tsx';
import { useStopRequested } from '../../hooks/useStopRequested.ts';
import { cn } from '../../lib/cn.ts';
import { traceDataMovement } from '../../lib/dataMovementTrace.ts';
import { formatActiveDuration, formatDate } from '../../lib/formatters.ts';
import { ConsoleSelectionButton, ProjectDetailLink } from './ExecutionRowLinks.tsx';
import { RunLivenessIndicator } from './RunLivenessIndicator.tsx';
import {
	consoleSelectionLabel,
	containerHoverClass,
	containerSelectableClass,
	containerSelectionHandler,
	runRuntimeDetail,
	runSourceLabel,
} from './runRowUtils.ts';
import {
	classifyRunRecord,
	continuationTitle,
	isRunStopping,
	isTerminalStatus,
} from './runsUtils.ts';

export function ActiveRunMobileCard({
	continued,
	continuePendingId,
	now,
	onContinue,
	onKill,
	onSelect,
	onStop,
	run,
	selected,
}: {
	continued: boolean;
	continuePendingId: string | undefined;
	now: number;
	onContinue: (id: string) => void;
	onKill: (id: string) => void;
	onSelect: (id: string) => void;
	onStop: (id: string) => void;
	run: RunRecord;
	selected: boolean;
}) {
	const terminal = isTerminalStatus(run.status);
	// A stop request winds the run down gracefully (it finishes its current step first), so the
	// card must show "Stopping…" — otherwise the run looks like it ignored the Stop click.
	const stopping = isRunStopping(run, useStopRequested(run.id));
	// `?? null` guards a payload from an older backend that predates the field (undefined).
	const continueReason = run.continuationReason ?? null;
	const showContinue = terminal && continueReason !== null && !continued;
	const continuePending = continuePendingId === run.id;
	const stopDisabled = terminal || !run.canStop || stopping;
	const killDisabled = terminal || !run.canKill;
	const disabledControlsHintId =
		stopDisabled || killDisabled ? `run-controls-disabled-mobile-${run.id}` : undefined;
	const directorCycleProjection =
		run.source === 'director' && run.mode === 'director' && !run.canStop && !run.canKill;
	const controlHint = directorCycleProjection
		? 'Director cycles can be monitored here; manage them from Director.'
		: stopping
			? 'Stop requested — the run finishes its current step, then stops. Kill force-terminates it.'
			: terminal
				? 'Controls are available only while a run is running.'
				: null;
	const runtimeDetail = runRuntimeDetail(run);
	const outcome = classifyRunRecord(run, stopping);
	const projectHref = directorCycleProjection
		? '/director'
		: `/projects/${encodeURIComponent(run.projectId)}`;
	const projectLabel = directorCycleProjection
		? 'Open Director'
		: `Open ${run.projectName} project details`;
	function selectRun(): void {
		traceDataMovement({
			category: 'event',
			layer: 'ui',
			operation: 'runs.console.select',
			source: 'RunsPage',
			summary: { runId: run.id },
		});
		onSelect(run.id);
	}
	return (
		<div
			aria-selected={selected}
			className={cn(
				'flex flex-col gap-2 px-4 py-3 transition-colors',
				containerSelectableClass,
				selected
					? 'bg-teal-100/80 shadow-[inset_4px_0_0_var(--accent)] dark:bg-teal-900/40'
					: containerHoverClass,
			)}
			onClick={containerSelectionHandler(selectRun)}
			role="listitem">
			<div className="flex min-w-0 items-center gap-2">
				<ConsoleSelectionButton
					className="min-w-0 shrink truncate capitalize"
					label={consoleSelectionLabel(run)}
					onSelect={selectRun}
					selected={selected}>
					{run.mode ?? 'Run'}
				</ConsoleSelectionButton>
				<RunCommandInfo command={run.launchCommand} runId={run.id} />
			</div>
			<div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
				<Badge tone={outcome.tone}>{outcome.label}</Badge>
				<Badge tone="neutral">Run</Badge>
				<ProjectDetailLink href={projectHref} label={projectLabel} name={run.projectName} />
				<span>{runSourceLabel(run)}</span>
				<span>{formatDate(run.startedAt)}</span>
				<span aria-hidden="true">·</span>
				<span>{formatActiveDuration(run.durationMs, run.startedAt, now)}</span>
			</div>
			<RunLivenessIndicator now={now} run={run} />
			<div className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
				<ExecutionIdentityBadges
					backend={run.backend}
					model={run.model}
					provider={run.provider}
					reasoningEffort={run.reasoningEffort}
				/>
				<span>{runtimeDetail}</span>
			</div>
			{run.aiSummary ? (
				<div className="line-clamp-2 min-w-0 text-xs break-words text-muted-foreground">
					{run.aiSummary}
				</div>
			) : null}
			<div className="flex flex-wrap items-center gap-2">
				{showContinue && continueReason !== null ? (
					<Button
						aria-label={`Continue ${run.projectName} with a follow-up run`}
						disabled={continuePendingId !== undefined}
						onClick={() => onContinue(run.id)}
						size="compact"
						title={continuationTitle(continueReason)}
						variant="primary">
						{continuePending ? (
							<Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
						) : (
							<Play aria-hidden="true" className="h-3.5 w-3.5" />
						)}
						<span>Continue</span>
					</Button>
				) : null}
				<Button
					aria-describedby={disabledControlsHintId}
					aria-label={
						stopping
							? `Stop requested for the ${run.projectName} run; it stops after its current step`
							: stopDisabled
								? directorCycleProjection
									? 'Stop unavailable: director cycle control is managed from Director'
									: 'Stop unavailable: run is no longer running'
								: 'Stop run'
					}
					disabled={stopDisabled}
					onClick={() => {
						if (stopDisabled) return;
						traceDataMovement({
							category: 'event',
							layer: 'ui',
							operation: 'runs.stop',
							source: 'RunsPage',
							summary: { runId: run.id },
							target: '/api/v1/runs/:id/stop',
						});
						onStop(run.id);
					}}
					size="compact"
					title={
						stopping
							? 'Stop requested — the run finishes its current step, then stops.'
							: undefined
					}>
					{stopping ? (
						<Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
					) : (
						<Square aria-hidden="true" className="h-3.5 w-3.5" />
					)}
					<span>{stopping ? 'Stopping…' : 'Stop'}</span>
				</Button>
				<Button
					aria-describedby={disabledControlsHintId}
					aria-label={
						killDisabled
							? directorCycleProjection
								? 'Kill unavailable: director cycle control is managed from Director'
								: 'Kill unavailable: run is no longer running'
							: 'Kill run'
					}
					disabled={killDisabled}
					onClick={() => {
						if (killDisabled) return;
						traceDataMovement({
							category: 'event',
							layer: 'ui',
							operation: 'runs.kill',
							source: 'RunsPage',
							summary: { runId: run.id },
							target: '/api/v1/runs/:id/kill',
						});
						onKill(run.id);
					}}
					size="compact"
					variant="danger">
					<X aria-hidden="true" className="h-3.5 w-3.5" />
					<span>Kill</span>
				</Button>
			</div>
			{controlHint && (
				<p className="text-xs text-muted-foreground" id={disabledControlsHintId}>
					{controlHint}
				</p>
			)}
		</div>
	);
}
