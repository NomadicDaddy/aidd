import type { ReactNode } from 'react';

import { Fragment } from 'react';

import type { FilterRegister } from '../../lib/filterFields.ts';

import { EmptyState } from '../../components/shared/EmptyState.tsx';
import { OverflowScroller } from '../../components/shared/OverflowScroller.tsx';
import { Card, CardHeader } from '../../components/ui/card.tsx';
import { useNow } from '../../hooks/useNow.ts';
import { tableHeadClass } from '../../lib/tableStyles.ts';
import { ActiveRunMobileCard, ActiveRunRow } from './ActiveRunRow.tsx';
import { PipelineSessionMobileCard, PipelineSessionRow } from './PipelineSessionRow.tsx';
import { PipelineStepSubRows } from './PipelineStepSubRows.tsx';
import { PipelineStepTableRows } from './PipelineStepTableRows.tsx';
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
	/** Present only on a feed a toolbar can narrow; the Active list has no filters to name. */
	emptyFilters?: FilterRegister | undefined;
	emptyMessage: string;
	entries: UnifiedEntry[];
	expandedSessions: ReadonlySet<string>;
	/**
	 * Rendered inside the Card below the body, as its footer row, so History's 'Show more' does not
	 * sit on the page background beneath the Card — the control that grows the table outside the box
	 * it grows.
	 */
	footer?: ReactNode;
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
	/**
	 * Caps the body in its own scrollport with a pinned header row. History is unbounded — after two
	 * 'Show more' presses the page ran 3214px and the column headings were long gone, with thirty
	 * rows still below them. Active is short by construction and stays in page flow.
	 */
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
				// No column header above nothing: a bare cell there reads as a broken table.
				<div className="p-4">
					<EmptyState filterReset="toolbar" filters={props.emptyFilters}>
						{props.emptyMessage}
					</EmptyState>
				</div>
			) : (
				<>
					<OverflowScroller ariaLabel={title} className="hidden xl:block">
						<table
							aria-label={title}
							className="w-full min-w-[68rem] table-fixed text-left text-sm [&_td:nth-child(2)]:wrap-anywhere [&_td:nth-child(5)>span]:whitespace-normal">
							{/* Both feeds use the same tracks regardless of their rows or available actions.
							    Name takes the remainder; Status has room for live activity and outcomes. */}
							<colgroup>
								<col />
								<col className="w-28" />
								<col className="w-48" />
								<col className="w-52" />
								<col className="w-48" />
								<col className="w-22" />
								<col className="w-32" />
							</colgroup>
							{/* Pinned per-cell rather than on the <thead>: a sticky thead leaves the cells
							    transparent, so rows scrolled through the headings. Each th carries the
							    strip background it needs to sit over them. */}
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
							<tbody className="[&>tr]:border-border">
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
													<PipelineStepTableRows
														now={now}
														onSelectRun={(runId) =>
															props.onSelectStepRun(
																entry.session.id,
																runId,
															)
														}
														selectedRunId={
															selection?.kind === 'run'
																? selection.id
																: undefined
														}
														sessionId={entry.session.id}
													/>
												)}
										</Fragment>
									),
								)}
							</tbody>
						</table>
					</OverflowScroller>
					{/* The narrow rendering is page flow. It carried the same viewport-remainder cap
					    as the table, which on a phone resolves below the fold and turned History
					    into a keyhole inside a page that then had nothing left to scroll. */}
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
								<div key={entryKey(entry)} role="listitem">
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
								</div>
							),
						)}
					</div>
				</>
			)}
			{/* Inside the box it grows. On the page background below the Card it read as a control
			    belonging to the page rather than to History, and it was the one thing separating
			    the table from the bottom of a 3214px scroll. */}
			{props.footer ? (
				<div className="flex justify-center border-t border-border px-4 py-3">
					{props.footer}
				</div>
			) : null}
		</Card>
	);
}
