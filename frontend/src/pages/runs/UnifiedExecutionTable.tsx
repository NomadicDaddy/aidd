import type { ReactNode } from 'react';

import { Fragment } from 'react';

import { EmptyState } from '../../components/shared/EmptyState.tsx';
import { OverflowScroller } from '../../components/shared/OverflowScroller.tsx';
import { Card, CardHeader } from '../../components/ui/card.tsx';
import { useNow } from '../../hooks/useNow.ts';
import { tableHeadClass } from '../../lib/tableStyles.ts';
import { ActiveRunMobileCard, ActiveRunRow } from './ActiveRunRow.tsx';
import { PipelineSessionMobileCard, PipelineSessionRow } from './PipelineSessionRow.tsx';
import { PipelineStepSubRows } from './PipelineStepSubRows.tsx';
import { normalizePathForFilter } from './runsUtils.ts';
import {
	entryKey,
	isEntryActive,
	isMultiStepSession,
	type UnifiedEntry,
	type UnifiedSelection,
} from './unifiedEntries.ts';

export interface UnifiedExecutionTableProps {
	/** Ids of runs that already have a follow-up run; their Continue button is hidden. */
	continuedRunIds: ReadonlySet<string>;
	/** Run id whose continue request is in flight (disables all Continue buttons). */
	continuePendingId: string | undefined;
	description: string;
	emptyMessage: string;
	entries: UnifiedEntry[];
	expandedSessions: ReadonlySet<string>;
	/** Lucide icon for the card header row, matching the Dashboard/Director card idiom. */
	icon: ReactNode;
	onContinue: (id: string) => void;
	onKill: (id: string) => void;
	onSelectPipeline: (id: string) => void;
	onSelectRun: (id: string) => void;
	/** A step's Console click: selects the step's run, keeping its session as context. */
	onSelectStepRun: (sessionId: string, runId: string) => void;
	onStop: (id: string) => void;
	onStopSession: (id: string) => void;
	onToggleSession: (id: string) => void;
	projectRouteIdByPath: ReadonlyMap<string, string>;
	selection: undefined | UnifiedSelection;
	/**
	 * Stop and Kill are gated on a non-terminal status, so in a table that only ever holds finished
	 * executions (History) they render as a column of permanently greyed icons. `false` suppresses
	 * them there. Continue and the pipeline Report link stay — those are the History actions that
	 * are genuinely reachable.
	 */
	showLifecycleControls?: boolean;
	title: string;
}

export function UnifiedExecutionTable(props: UnifiedExecutionTableProps) {
	const { entries, expandedSessions, selection, showLifecycleControls = true, title } = props;
	// The 1s clock that advances live durations/liveness lives here, scoped to the table, so an
	// active execution only re-renders these rows — not the launch form, filters, or live console.
	const now = useNow(entries.some(isEntryActive));
	const isSelected = (entry: UnifiedEntry): boolean =>
		entry.kind === 'run'
			? selection?.kind === 'run' && selection.id === entry.run.id
			: selection?.kind === 'pipeline' && selection.id === entry.session.id;
	const stepSubRows = (entry: Extract<UnifiedEntry, { kind: 'pipeline' }>) => (
		<PipelineStepSubRows
			now={now}
			onSelectRun={(runId) => props.onSelectStepRun(entry.session.id, runId)}
			selectedRunId={selection?.kind === 'run' ? selection.id : undefined}
			sessionId={entry.session.id}
		/>
	);
	return (
		// The title and its description live inside the Card as the house header row (icon + title,
		// description beneath) rather than floating on the page background above an unlabelled
		// rectangle, which is how Dashboard and Director render the same type step.
		<Card className="overflow-hidden p-0">
			<CardHeader
				className="mb-0 border-b border-border px-4 py-3"
				description={props.description}
				icon={props.icon}
				title={title}
			/>
			{entries.length === 0 ? (
				// The house empty presentation, and no column header above nothing: the bare dim
				// <td> under a full seven-column head read as a broken table rather than as "there
				// is nothing here".
				<div className="p-4">
					<EmptyState>{props.emptyMessage}</EmptyState>
				</div>
			) : (
				<>
					<OverflowScroller ariaLabel={title} className="hidden xl:block">
						<table
							aria-label={title}
							className="w-full min-w-[56rem] table-fixed text-left text-sm">
							{/* MODEL takes six points off STATUS, which was holding 17% for one badge
							    while MODEL ellipsised every segment of an execution identity to a
							    character or two down twenty rows. */}
							<colgroup>
								<col className="w-[21%]" />
								<col className="w-[11%]" />
								<col className="w-[9%]" />
								<col className="w-[26%]" />
								<col className="w-[12%]" />
								<col className="w-[9%]" />
								<col className="w-[12%]" />
							</colgroup>
							<thead className={tableHeadClass}>
								<tr>
									<th className="py-3 pr-3 pl-4" scope="col">
										Name
									</th>
									<th className="px-3 py-3" scope="col">
										Project
									</th>
									<th className="px-3 py-3" scope="col">
										Kind
									</th>
									<th className="px-3 py-3" scope="col">
										Model
									</th>
									<th className="px-3 py-3" scope="col">
										Status
									</th>
									<th className="px-3 py-3" scope="col">
										Duration
									</th>
									<th className="py-3 pr-4 pl-3" scope="col">
										Actions
									</th>
								</tr>
							</thead>
							<tbody>
								{entries.map((entry) =>
									entry.kind === 'run' ? (
										<ActiveRunRow
											continued={props.continuedRunIds.has(entry.run.id)}
											continuePendingId={props.continuePendingId}
											key={entryKey(entry)}
											now={now}
											onContinue={props.onContinue}
											onKill={props.onKill}
											onSelect={props.onSelectRun}
											onStop={props.onStop}
											run={entry.run}
											selected={isSelected(entry)}
											showLifecycleControls={showLifecycleControls}
										/>
									) : (
										<Fragment key={entryKey(entry)}>
											<PipelineSessionRow
												expanded={expandedSessions.has(entry.session.id)}
												now={now}
												onSelect={props.onSelectPipeline}
												onStop={props.onStopSession}
												onToggle={props.onToggleSession}
												projectRouteId={props.projectRouteIdByPath.get(
													normalizePathForFilter(
														entry.session.projectPath,
													),
												)}
												selected={isSelected(entry)}
												session={entry.session}
												showLifecycleControls={showLifecycleControls}
											/>
											{isMultiStepSession(entry.session) &&
												expandedSessions.has(entry.session.id) && (
													<tr className="border-b bg-muted/60 last:border-0">
														<td className="p-0" colSpan={7}>
															{stepSubRows(entry)}
														</td>
													</tr>
												)}
										</Fragment>
									),
								)}
							</tbody>
						</table>
					</OverflowScroller>
					<div
						aria-label={title}
						className="flex flex-col divide-y divide-border xl:hidden"
						role="list">
						{entries.map((entry) =>
							entry.kind === 'run' ? (
								<ActiveRunMobileCard
									continued={props.continuedRunIds.has(entry.run.id)}
									continuePendingId={props.continuePendingId}
									key={entryKey(entry)}
									now={now}
									onContinue={props.onContinue}
									onKill={props.onKill}
									onSelect={props.onSelectRun}
									onStop={props.onStop}
									run={entry.run}
									selected={isSelected(entry)}
									showLifecycleControls={showLifecycleControls}
								/>
							) : (
								<Fragment key={entryKey(entry)}>
									<PipelineSessionMobileCard
										expanded={expandedSessions.has(entry.session.id)}
										now={now}
										onSelect={props.onSelectPipeline}
										onStop={props.onStopSession}
										onToggle={props.onToggleSession}
										projectRouteId={props.projectRouteIdByPath.get(
											normalizePathForFilter(entry.session.projectPath),
										)}
										selected={isSelected(entry)}
										session={entry.session}
										showLifecycleControls={showLifecycleControls}
									/>
									{isMultiStepSession(entry.session) &&
										expandedSessions.has(entry.session.id) && (
											<div className="bg-muted/60">{stepSubRows(entry)}</div>
										)}
								</Fragment>
							),
						)}
					</div>
				</>
			)}
		</Card>
	);
}
