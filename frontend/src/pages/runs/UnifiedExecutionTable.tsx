import { Fragment } from 'react';

import { Card } from '../../components/ui/card.tsx';
import { useNow } from '../../hooks/useNow.ts';
import { ActiveRunMobileCard, ActiveRunRow } from './ActiveRunRow.tsx';
import { PipelineSessionMobileCard, PipelineSessionRow } from './PipelineSessionRow.tsx';
import { PipelineStepSubRows } from './PipelineStepSubRows.tsx';
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
	onContinue: (id: string) => void;
	onKill: (id: string) => void;
	onSelectPipeline: (id: string) => void;
	onSelectRun: (id: string) => void;
	/** A step's Console click: selects the step's run, keeping its session as context. */
	onSelectStepRun: (sessionId: string, runId: string) => void;
	onStop: (id: string) => void;
	onStopSession: (id: string) => void;
	onToggleSession: (id: string) => void;
	selection: undefined | UnifiedSelection;
	title: string;
}

export function UnifiedExecutionTable(props: UnifiedExecutionTableProps) {
	const { entries, expandedSessions, selection, title } = props;
	// The 1s clock that advances live durations/liveness lives here, scoped to the table, so an
	// active execution only re-renders these rows — not the launch form, filters, or live console.
	const now = useNow(entries.some(isEntryActive));
	const isSelected = (entry: UnifiedEntry): boolean =>
		entry.kind === 'run'
			? selection?.kind === 'run' && selection.id === entry.run.id
			: selection?.kind === 'pipeline' && selection.id === entry.session.id;
	return (
		<section className="space-y-2">
			<div>
				<h2 className="text-sm font-semibold text-foreground">{title}</h2>
				<p className="text-xs text-neutral-500">{props.description}</p>
			</div>
			<Card className="overflow-hidden p-0">
				<div className="hidden overflow-x-auto md:block">
					<table aria-label={title} className="w-full text-left text-sm">
						<thead className="border-b bg-neutral-50 text-xs text-neutral-500 uppercase dark:bg-neutral-900">
							<tr>
								<th className="py-3 pr-3 pl-4" scope="col">
									Name
								</th>
								<th className="px-3 py-3" scope="col">
									Project
								</th>
								<th className="px-3 py-3" scope="col">
									Type
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
							{entries.length === 0 && (
								<tr>
									<td className="px-4 py-4 text-neutral-500" colSpan={7}>
										{props.emptyMessage}
									</td>
								</tr>
							)}
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
									/>
								) : (
									<Fragment key={entryKey(entry)}>
										<PipelineSessionRow
											expanded={expandedSessions.has(entry.session.id)}
											now={now}
											onSelect={props.onSelectPipeline}
											onStop={props.onStopSession}
											onToggle={props.onToggleSession}
											selected={isSelected(entry)}
											session={entry.session}
										/>
										{isMultiStepSession(entry.session) &&
											expandedSessions.has(entry.session.id) && (
												<tr className="border-b bg-neutral-50/60 last:border-0 dark:bg-neutral-900/40">
													<td className="p-0" colSpan={7}>
														<PipelineStepSubRows
															now={now}
															onSelectRun={(runId) =>
																props.onSelectStepRun(
																	entry.session.id,
																	runId,
																)
															}
															sessionId={entry.session.id}
														/>
													</td>
												</tr>
											)}
									</Fragment>
								),
							)}
						</tbody>
					</table>
				</div>
				<div
					aria-label={title}
					className="flex flex-col divide-y md:hidden dark:divide-neutral-800"
					role="list">
					{entries.length === 0 && (
						<p className="px-4 py-4 text-sm text-neutral-500">{props.emptyMessage}</p>
					)}
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
							/>
						) : (
							<Fragment key={entryKey(entry)}>
								<PipelineSessionMobileCard
									expanded={expandedSessions.has(entry.session.id)}
									now={now}
									onSelect={props.onSelectPipeline}
									onStop={props.onStopSession}
									onToggle={props.onToggleSession}
									selected={isSelected(entry)}
									session={entry.session}
								/>
								{isMultiStepSession(entry.session) &&
									expandedSessions.has(entry.session.id) && (
										<div className="bg-neutral-50/60 dark:bg-neutral-900/40">
											<PipelineStepSubRows
												now={now}
												onSelectRun={(runId) =>
													props.onSelectStepRun(entry.session.id, runId)
												}
												sessionId={entry.session.id}
											/>
										</div>
									)}
							</Fragment>
						),
					)}
				</div>
			</Card>
		</section>
	);
}
