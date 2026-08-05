import { default as Loader2 } from 'lucide-react/dist/esm/icons/loader-2';
import { default as Play } from 'lucide-react/dist/esm/icons/play';
import { default as Square } from 'lucide-react/dist/esm/icons/square';
import { default as X } from 'lucide-react/dist/esm/icons/x';

import type { RunRecord } from '../../api/types.ts';

import { ExecutionIdentityBadges } from '../../components/shared/ExecutionIdentityBadges.tsx';
import { RunCommandInfo } from '../../components/shared/RunCommandInfo.tsx';
import { Badge } from '../../components/ui/badge.tsx';
import { Button, IconButton } from '../../components/ui/button.tsx';
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
	containerSelectedClass,
	containerSelectionHandler,
	leadingSlotClass,
	runSourceLabel,
} from './runRowUtils.ts';
import {
	classifyRunRecord,
	continuationTitle,
	isRunStopping,
	isTerminalStatus,
} from './runsUtils.ts';

export { ActiveRunMobileCard } from './ActiveRunMobileCard.tsx';

export function ActiveRunRow({
	continued,
	continuePendingId,
	now,
	onContinue,
	onKill,
	onSelect,
	onStop,
	run,
	selected,
	showLifecycleControls = true,
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
	showLifecycleControls?: boolean;
}) {
	const terminal = isTerminalStatus(run.status);
	// A stop request winds the run down gracefully (it finishes its current step first), so the
	// row must show "Stopping…" — otherwise the run looks like it ignored the Stop click.
	const stopping = isRunStopping(run, useStopRequested(run.id));
	// `?? null` guards a payload from an older backend that predates the field (undefined).
	const continueReason = run.continuationReason ?? null;
	const showContinue = terminal && continueReason !== null && !continued;
	const continuePending = continuePendingId === run.id;
	const stopDisabled = terminal || !run.canStop || stopping;
	const killDisabled = terminal || !run.canKill;
	const directorCycleProjection =
		run.source === 'director' && run.mode === 'director' && !run.canStop && !run.canKill;
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
		<tr
			aria-selected={selected}
			className={cn(
				'border-b transition-colors last:border-0',
				containerSelectableClass,
				selected ? containerSelectedClass : containerHoverClass,
			)}
			onClick={containerSelectionHandler(selectRun)}>
			<td className="py-3 pr-3 pl-4">
				<div className="flex flex-wrap items-center gap-2">
					{/* Empty leading slot: session rows spend these 24px on a chevron or the
					    Workflow icon, so reserving them here is what gives the column one left
					    edge across all three row types. */}
					<span aria-hidden="true" className={leadingSlotClass} />
					<ConsoleSelectionButton
						className="capitalize"
						label={consoleSelectionLabel(run)}
						onSelect={selectRun}
						selected={selected}>
						{run.mode ?? 'Run'}
					</ConsoleSelectionButton>
					<RunCommandInfo command={run.launchCommand} runId={run.id} />
				</div>
				<div className="mt-1 text-xs text-muted-foreground">
					{formatDate(run.startedAt)}
				</div>
				{run.aiSummary ? (
					<div className="mt-1 line-clamp-2 max-w-[26rem] text-xs text-muted-foreground">
						{run.aiSummary}
					</div>
				) : null}
			</td>
			<td className="px-3 py-3">
				<ProjectDetailLink href={projectHref} label={projectLabel} name={run.projectName} />
			</td>
			<td className="px-3 py-3">
				{/* One line in both branches of the column: a session row's KIND cell is a single
				    badge, so the launch source rides beside the badge rather than adding a second
				    line that only run rows carry. */}
				<div className="flex flex-wrap items-center gap-1.5">
					<Badge tone="neutral">Run</Badge>
					<span className="text-xs text-muted-foreground">{runSourceLabel(run)}</span>
				</div>
			</td>
			<td className="px-3 py-3">
				{/* No `max-w` here any more: the column budget is the colgroup's job, and capping
				    the cell below it was what made the model segment ellipsise to two characters
				    while the column still had room. */}
				<div className="flex min-w-0 flex-wrap items-center gap-1.5">
					<ExecutionIdentityBadges
						backend={run.backend}
						model={run.model}
						provider={run.provider}
						reasoningEffort={run.reasoningEffort}
						variant="compact"
					/>
				</div>
			</td>
			<td className="px-3 py-3">
				<Badge tone={outcome.tone}>{outcome.label}</Badge>
				<RunLivenessIndicator now={now} run={run} />
			</td>
			<td className="px-3 py-3 whitespace-nowrap">
				{formatActiveDuration(run.durationMs, run.startedAt, now)}
			</td>
			<td className="py-3 pr-4 pl-3">
				<div className="flex gap-2">
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
					{/* Stop and Kill are only ever enabled on a live run; in History they were ten
					    greyed icons per screen carrying no information. Continue stays — it is the
					    one control a finished run can still offer. */}
					{showLifecycleControls ? (
						<>
							<IconButton
								ariaLabel={
									stopping
										? `Stop requested for the ${run.projectName} run; it stops after its current step`
										: stopDisabled
											? directorCycleProjection
												? 'Stop unavailable: director cycle control is managed from Director'
												: 'Stop unavailable: run is no longer running'
											: 'Stop run'
								}
								className="h-8 w-8"
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
								title={
									stopping
										? 'Stop requested — the run finishes its current step, then stops.'
										: stopDisabled
											? directorCycleProjection
												? 'Director cycle control is managed from Director.'
												: 'Stop is available only while a run is running.'
											: 'Stop run'
								}>
								{stopping ? (
									<Loader2
										aria-hidden="true"
										className="h-3.5 w-3.5 animate-spin"
									/>
								) : (
									<Square aria-hidden="true" className="h-3.5 w-3.5" />
								)}
							</IconButton>
							<IconButton
								ariaLabel={
									killDisabled
										? directorCycleProjection
											? 'Kill unavailable: director cycle control is managed from Director'
											: 'Kill unavailable: run is no longer running'
										: 'Kill run'
								}
								className="h-8 w-8"
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
								title={
									killDisabled
										? directorCycleProjection
											? 'Director cycle control is managed from Director.'
											: 'Kill is available only while a run is running.'
										: 'Kill run'
								}
								variant="danger">
								<X aria-hidden="true" className="h-3.5 w-3.5" />
							</IconButton>
						</>
					) : null}
				</div>
			</td>
		</tr>
	);
}
