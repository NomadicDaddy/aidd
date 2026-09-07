import type { PipelineStepResultRecord, RunRecord } from '../../api/types.ts';

import { proseMeasureClass } from '../../lib/typography.ts';
import { MetadataItem, RunCommandBlock, RunCommitsSection } from '../runs/runDetailParts.tsx';
import { formatRunNarrative } from './runNarrative.ts';

/**
 * What a step's run actually did, above its transcript.
 *
 * Opening the very same run in the Live Console shows a result line, an execution target, the
 * launch command and file-change chips; a report page that gives ~700 of its 1200 visible pixels to
 * a raw NDJSON slab and says nothing else about the step omits everything its own console shows,
 * which is strictly worse than the thing it summarises. So these blocks are the same components the
 * console renders — imported from `pages/runs/runDetailParts.tsx` rather than reimplemented, which
 * is what keeps the two surfaces from drifting.
 *
 * The badges, name, timestamps and duration stay on the step card's own header; repeating them here
 * would only restate the row this sits inside. What is added is what the step record does not carry:
 * the run's narrative result, its exit code, its command, and its commits and file changes.
 */
export function StepRunDetail({
	run,
	sessionErrorMessage,
	step,
}: {
	run: RunRecord | undefined;
	sessionErrorMessage: null | string;
	step: PipelineStepResultRecord;
}) {
	if (!run) return null;

	const result = run.aiSummary ?? run.summary;
	const normalizedSummary = run.summary?.trim().replace(/[.!]$/u, '').toLowerCase();
	const summaryRepeatsExitCode =
		run.exitCode !== null &&
		[
			`completed with exit code ${run.exitCode}`,
			`exit code ${run.exitCode}`,
			`exited with code ${run.exitCode}`,
		].includes(normalizedSummary ?? '');
	return (
		// The containment goes here rather than on the step Card, because a container query cannot
		// style the element that declares it and the grid below is this wrapper's own child.
		<div className="@container mt-3 space-y-3">
			{result ? (
				// The step's AI summary is the one paragraph of running prose on this page, and it
				// was setting at the full report width. The error message below stays uncapped:
				// it is machine output as often as it is a sentence.
				<p className={`text-sm break-words text-foreground ${proseMeasureClass}`}>
					{formatRunNarrative(result)}
				</p>
			) : null}
			{/* Mode and exit code are intrinsically short facts, so they share content-sized tracks at
			    every width. A distinct narrative result remains full-width below them. */}
			<dl className="grid max-w-full grid-cols-[minmax(0,max-content)_minmax(0,max-content)] gap-x-8 gap-y-2">
				<MetadataItem label="Mode" mono value={run.mode} />
				{/* No Duration here. The docstring above says the step card's own header keeps the
				    timestamps and the duration, and printing `step.durationMs` in this grid too
				    would restate the value the header prints two lines up, from the same field —
				    and worse than restate it: the header renders it in the sans face and
				    `MetadataItem mono` would render it in Geist Mono, so one page would show
				    `5m 18s` twice, 200px apart, in two typefaces. The header is the one that keeps
				    it, because it is the one the docstring already assigned it to. */}
				{/* Mono, because the run panel prints its exit code mono and the same integer in
				    sans one route apart is a named inconsistency. */}
				{run.exitCode !== null ? (
					<MetadataItem label="Exit code" mono value={String(run.exitCode)} />
				) : null}
				{/* The guard excludes the narrative above and the two error sentences that carry
				    the same text. `run.summary` on a failed run is usually the step's
				    `errorMessage` word for word, and that sentence has already been read once at
				    the top of the report as the session's Status detail — so RESULT would be the
				    third printing of it, not a record. */}
				{run.summary &&
				!summaryRepeatsExitCode &&
				run.summary !== result &&
				run.summary !== step.errorMessage &&
				run.summary !== sessionErrorMessage ? (
					<MetadataItem
						className="col-span-full"
						label="Result"
						value={run.summary}
						valueClassName={proseMeasureClass}
					/>
				) : null}
			</dl>
			<RunCommandBlock command={run.launchCommand} runId={run.id} />
			<RunCommitsSection run={run} />
		</div>
	);
}
