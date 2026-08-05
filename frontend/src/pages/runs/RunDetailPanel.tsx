import { skillExecutionIntentLabel } from 'aidd-shared/skill-execution-intent';
import { default as FileEdit } from 'lucide-react/dist/esm/icons/file-pen';
import { default as FilePlus } from 'lucide-react/dist/esm/icons/file-plus';
import { default as GitCommit } from 'lucide-react/dist/esm/icons/git-commit';
import { useState } from 'react';

import type { GitCommitRef, RunRecord } from '../../api/types.ts';

import { CommitChips } from '../../components/shared/CommitChips.tsx';
import { CommitDiffDialog } from '../../components/shared/CommitDiffDialog.tsx';
import { ExecutionIdentityBadges } from '../../components/shared/ExecutionIdentityBadges.tsx';
import { RunCommandInfo } from '../../components/shared/RunCommandInfo.tsx';
import { Badge } from '../../components/ui/badge.tsx';
import { Card } from '../../components/ui/card.tsx';
import { Tooltip } from '../../components/ui/tooltip.tsx';
import { useRunCommits } from '../../hooks/useCommits.ts';
import { useStopRequested } from '../../hooks/useStopRequested.ts';
import { formatAiddRunProvenance } from '../../lib/aiddRunProvenance.ts';
import { formatDuration } from '../../lib/formatters.ts';
import { fieldLabelClass } from '../../lib/formStyles.ts';
import { MetadataItem, ReadOnlyContractViolation } from './runDetailParts.tsx';
import { FileChangeChip } from './RunFileChangeChip.tsx';
import { classifyRunRecord, isRunStopping } from './runsUtils.ts';
import {
	isReadOnlySkillDirectiveViolation,
	skillDirectiveExecutionIntent,
} from './skillDirectiveIntent.ts';

// One surface step below the sunken panel around it, so command text and the stop transcript read
// as recessed content rather than as a third ad-hoc fill.
const detailPreClass =
	'overflow-auto rounded-md border border-border bg-background p-2 text-xs whitespace-pre-wrap text-foreground';

// The panel renders only for terminal runs (LiveConsole gates on status !== 'running'), so the
// commit query can run unconditionally — the ledger line, if any, already exists.
function RunCommitsSection({ run }: { run: RunRecord }) {
	const query = useRunCommits(run.id);
	const [selectedCommit, setSelectedCommit] = useState<GitCommitRef | null>(null);
	const data = query.data;
	// 'ledger-missing' means the project has no run history on disk at all (e.g. deleted
	// project dir) — showing a "no commits" row there would just be noise.
	if (!data || data.state === 'ledger-missing' || data.state === 'run-not-found') return null;

	const hasCommits = data.state === 'ok' && data.commits.length > 0;
	// When the ledger says commits were created (totals.commitsCreated > 0) but no commit refs
	// are present in the attributed list, it means the run's commits touched feature directories
	// outside the run's attributed set (directive/role/audit modes) and were filtered — not that
	// no commits were made. Surface the count so the operator sees the run did produce commits.
	const unattributedCount =
		data.commitsCreatedCount > 0 && data.commits.length === 0 ? data.commitsCreatedCount : 0;
	const hasFileChanges = data.filesCreated > 0 || data.filesEdited > 0;
	const readOnlyViolation = isReadOnlySkillDirectiveViolation(run, data);

	// Skip the entire section if there's nothing to show.
	if (!hasCommits && !unattributedCount && !hasFileChanges && data.state === 'ok') {
		return null;
	}

	return (
		<div className="space-y-2">
			{readOnlyViolation ? <ReadOnlyContractViolation /> : null}
			{(hasFileChanges || unattributedCount > 0) && (
				<div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
					{data.filesCreated > 0 ? (
						<FileChangeChip
							kind="created"
							paths={data.fileChanges.created}
							source={data.fileChanges.source}
							truncated={data.fileChanges.truncated}>
							<FilePlus
								aria-hidden="true"
								className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400"
							/>
							{data.filesCreated} {data.filesCreated === 1 ? 'file' : 'files'} created
						</FileChangeChip>
					) : null}
					{data.filesEdited > 0 ? (
						<FileChangeChip
							kind="edited"
							paths={data.fileChanges.edited}
							source={data.fileChanges.source}
							truncated={data.fileChanges.truncated}>
							<FileEdit
								aria-hidden="true"
								className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400"
							/>
							{data.filesEdited} {data.filesEdited === 1 ? 'file' : 'files'} edited
						</FileChangeChip>
					) : null}
					{unattributedCount > 0 ? (
						<span className="inline-flex items-center gap-1">
							<GitCommit
								aria-hidden="true"
								className="h-3.5 w-3.5 text-muted-foreground"
							/>
							{unattributedCount} {unattributedCount === 1 ? 'commit' : 'commits'}
						</span>
					) : null}
				</div>
			)}
			{hasCommits ? (
				<div>
					<div className={`mb-1 ${fieldLabelClass}`}>Commits</div>
					<CommitChips commits={data.commits} onSelect={setSelectedCommit} />
				</div>
			) : null}
			{selectedCommit ? (
				<CommitDiffDialog
					commit={selectedCommit}
					onClose={() => setSelectedCommit(null)}
					projectId={run.projectId}
				/>
			) : null}
		</div>
	);
}

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
			<dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
				<MetadataItem label="Mode" value={selectedRun.mode} />
				{executionIntent ? (
					<MetadataItem
						label="Directive intent"
						value={`${skillExecutionIntentLabel(executionIntent)}${
							executionIntent === 'review-only' ? ' (instruction-enforced)' : ''
						}`}
					/>
				) : null}
				<MetadataItem label="Duration" value={formatDuration(selectedRun.durationMs)} />
				<MetadataItem
					label="aidd provenance"
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
			<div>
				<div className={`mb-1 flex items-center gap-1.5 ${fieldLabelClass}`}>
					Command
					<RunCommandInfo command={selectedRun.launchCommand} runId={selectedRun.id} />
				</div>
				<pre className={`max-h-28 font-mono ${detailPreClass}`}>
					{selectedRun.launchCommand?.display ?? 'Unavailable'}
				</pre>
			</div>
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
	);
}
