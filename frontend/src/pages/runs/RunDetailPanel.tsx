import { isProcessExitCode } from 'aidd-shared/runs/outcome';
import { skillExecutionIntentLabel } from 'aidd-shared/skill-execution-intent';

import type { RunRecord } from '../../api/types.ts';

import { ExecutionIdentityBadges } from '../../components/shared/ExecutionIdentityBadges.tsx';
import { Badge } from '../../components/ui/badge.tsx';
import { Card } from '../../components/ui/card.tsx';
import { Tooltip } from '../../components/ui/tooltip.tsx';
import { useProject } from '../../hooks/useProjects.ts';
import { useStopRequested } from '../../hooks/useStopRequested.ts';
import { formatAiddRunDriver, formatAiddRunProvenance } from '../../lib/aiddRunProvenance.ts';
import { formatDuration } from '../../lib/formatters.ts';
import { microLabelClass } from '../../lib/typography.ts';
import {
	detailPreClass,
	MetadataItem,
	RunCommandBlock,
	RunCommitsSection,
} from './runDetailParts.tsx';
import { RunFinalChecks } from './RunFinalChecks.tsx';
import { resolveRunFinalCheckState } from './runFinalCheckState.ts';
import { presentRunRecordInitiator } from './runInitiator.ts';
import { runSourceLabel } from './runRowUtils.ts';
import { classifyRunRecord, isRunStopping } from './runsUtils.ts';
import { skillDirectiveExecutionIntent } from './skillDirectiveIntent.ts';

export function RunDetailPanel({
	selectedRun,
	stopDetail,
}: {
	selectedRun: RunRecord;
	stopDetail: null | string;
}) {
	// Mirror the run row: while a stop request winds the run down, the detail badge reads
	// "Stopping…" instead of a plain "Running".
	const outcome = classifyRunRecord(
		selectedRun,
		isRunStopping(selectedRun, useStopRequested(selectedRun.id)),
	);
	const exitLabel = isProcessExitCode(selectedRun.exitCode)
		? `Exit ${selectedRun.exitCode}${outcome.tone === 'emerald' ? '' : ` · ${outcome.label}`}`
		: null;
	const executionIntent = skillDirectiveExecutionIntent(selectedRun);
	// The run row already resolved this run to a project; the same project-detail query backs
	// the Runs table, so the ledger the checks come from is usually already in cache.
	const project = useProject(selectedRun.projectId);
	const finalCheckState = resolveRunFinalCheckState({
		isError: project.isError,
		iterations: project.data?.metadata.localIterations,
		runId: selectedRun.id,
	});
	return (
		// This panel is a column of the Runs split at 2xl, not the content column, so the metadata
		// grid below is keyed off the panel's measured width. Containment sits outside the card so
		// the query is not reading the card's padding. See the table in AppLayout.tsx.
		<div className="@container min-w-0">
			<Card className="mb-3 min-w-0 space-y-3" variant="sunken">
				<div className="flex flex-wrap items-center gap-2">
					<Tooltip content={outcome.title}>
						<span className="inline-flex rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
							<Badge showDot tone={outcome.tone}>
								{outcome.label}
							</Badge>
						</span>
					</Tooltip>
					{exitLabel ? (
						<span className="font-mono text-xs text-muted-foreground">{exitLabel}</span>
					) : null}
				</div>
				{/* The narrative summary leads the panel at one step above the metadata around it; the
			    machine-written `summary` restates the same outcome, so it is filed as the 'Result'
			    record in the dl below rather than sitting beside this as an equal paragraph. */}
				{selectedRun.aiSummary ? (
					<p className="text-sm break-words text-foreground">{selectedRun.aiSummary}</p>
				) : null}
				{/* Three columns, not four: the short values are Mode, Source, Duration, Provenance and
			    Driver, which fill three columns evenly. The entries whose value is a sentence or a
			    row of badges take a full row of their own rather than a half-empty span. */}
				<dl className="grid grid-cols-2 gap-x-4 gap-y-2 @min-[32rem]:grid-cols-3">
					<MetadataItem label="Mode" mono value={selectedRun.mode} />
					{/* The same label the row that opened this panel carries, from the same helper,
					    so a row that reads Director cannot open a detail that reads Web. */}
					<MetadataItem label="Source" value={runSourceLabel(selectedRun)} />
					{executionIntent ? (
						<MetadataItem
							label="Directive intent"
							value={`${skillExecutionIntentLabel(executionIntent)}${
								executionIntent === 'review-only' ? ' (instruction-enforced)' : ''
							}`}
						/>
					) : null}
					<MetadataItem
						label="Duration"
						mono
						value={formatDuration(selectedRun.durationMs)}
					/>
					{/* The label was the only one in the row long enough to wrap, which pushed its value
				    a line below Mode and Duration — three values in one row on two baselines. */}
					{/* `mono` for the same reason the Runs tab's copy of this line is: a version, a
					    SHA and a tree state are machine strings. */}
					<MetadataItem
						label="Provenance"
						mono
						value={formatAiddRunProvenance(selectedRun)}
					/>
					<MetadataItem label="Driver" mono value={formatAiddRunDriver(selectedRun)} />
					{/* Full width and a whole sentence, because this is the one line in the grid that
				    is a claim about who is responsible rather than a value. "Unknown" for a
				    pre-provenance row says so outright instead of leaving a blank the reader would
				    fill in with "me". */}
					<MetadataItem
						className="col-span-full"
						label="Triggered by"
						value={presentRunRecordInitiator(selectedRun).sentence}
					/>
					{selectedRun.summary ? (
						<MetadataItem
							className="col-span-full"
							label="Result"
							value={selectedRun.summary}
						/>
					) : null}
					{/* Full width because the value is a row of badges, and it is the one entry here
					    that can say nothing at all — the reason why is a sentence, not a value. */}
					<MetadataItem
						className="col-span-full"
						label="Final checks"
						value={<RunFinalChecks state={finalCheckState} />}
					/>
					<div className="col-span-full flex min-w-0 flex-col">
						<dt className={microLabelClass}>Execution target</dt>
						<dd className="mt-0.5 min-w-0">
							<ExecutionIdentityBadges
								backend={selectedRun.backend}
								model={selectedRun.model}
								provider={selectedRun.provider}
								reasoningEffort={selectedRun.reasoningEffort}
							/>
						</dd>
					</div>
				</dl>
				<RunCommandBlock command={selectedRun.launchCommand} runId={selectedRun.id} />
				<RunCommitsSection run={selectedRun} />
				{stopDetail ? (
					<div>
						<div className={`mb-1 ${microLabelClass}`}>Stop detail</div>
						<pre className={`max-h-[calc(12lh+1rem+2px)] ${detailPreClass}`}>
							{stopDetail}
						</pre>
					</div>
				) : null}
				{selectedRun.errorMessage && selectedRun.errorMessage !== selectedRun.summary ? (
					<div>
						<div className={`mb-1 ${microLabelClass}`}>Error</div>
						<p className="text-xs break-words text-foreground">
							{selectedRun.errorMessage}
						</p>
					</div>
				) : null}
			</Card>
		</div>
	);
}
