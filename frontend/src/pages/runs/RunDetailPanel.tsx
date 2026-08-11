import { skillExecutionIntentLabel } from 'aidd-shared/skill-execution-intent';

import type { RunRecord } from '../../api/types.ts';

import { ExecutionIdentityBadges } from '../../components/shared/ExecutionIdentityBadges.tsx';
import { Badge } from '../../components/ui/badge.tsx';
import { Card } from '../../components/ui/card.tsx';
import { Tooltip } from '../../components/ui/tooltip.tsx';
import { useStopRequested } from '../../hooks/useStopRequested.ts';
import { formatAiddRunProvenance } from '../../lib/aiddRunProvenance.ts';
import { formatDuration } from '../../lib/formatters.ts';
import { fieldLabelClass } from '../../lib/formStyles.ts';
import {
	detailPreClass,
	MetadataItem,
	RunCommandBlock,
	RunCommitsSection,
} from './runDetailParts.tsx';
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
	const exitLabel =
		selectedRun.exitCode !== null
			? `Exit ${selectedRun.exitCode}${outcome.tone === 'emerald' ? '' : ` · ${outcome.label}`}`
			: null;
	const executionIntent = skillDirectiveExecutionIntent(selectedRun);
	return (
		// This panel is a column of the Runs split at 2xl, not the content column, so the metadata
		// grid below is keyed off the panel's measured width. Containment sits outside the card so
		// the query is not reading the card's padding. See the table in AppLayout.tsx.
		<div className="@container min-w-0">
			<Card className="mb-3 min-w-0 space-y-3" variant="sunken">
				<div className="flex flex-wrap items-center gap-2">
					<Tooltip content={outcome.title}>
						<span className="inline-flex rounded-md focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:outline-none dark:focus-visible:ring-teal-300">
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
				{/* Three columns, not four: the row normally holds exactly Mode, Duration and provenance,
			    and Execution target takes a full row of its own rather than a half-empty span. */}
				<dl className="grid grid-cols-2 gap-x-4 gap-y-2 @min-[32rem]:grid-cols-3">
					<MetadataItem label="Mode" mono value={selectedRun.mode} />
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
					{selectedRun.summary ? (
						<MetadataItem
							className="col-span-full"
							label="Result"
							value={selectedRun.summary}
						/>
					) : null}
					<div className="col-span-full flex min-w-0 flex-col">
						<dt className={fieldLabelClass}>Execution target</dt>
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
						<div className={`mb-1 ${fieldLabelClass}`}>Stop detail</div>
						<pre className={`max-h-48 ${detailPreClass}`}>{stopDetail}</pre>
					</div>
				) : null}
				{selectedRun.errorMessage && selectedRun.errorMessage !== selectedRun.summary ? (
					<div>
						<div className={`mb-1 ${fieldLabelClass}`}>Error</div>
						<p className="text-xs break-words text-foreground">
							{selectedRun.errorMessage}
						</p>
					</div>
				) : null}
			</Card>
		</div>
	);
}
