import type { PipelineStepResultRecord } from '../../api/types.ts';

import { useRunRecord } from '../../hooks/useRuns.ts';
import { proseMeasureClass } from '../../lib/typography.ts';
import { MetadataItem, RunCommandBlock, RunCommitsSection } from '../runs/runDetailParts.tsx';

/**
 * What a step's run actually did, above its transcript.
 *
 * The report page used to give ~700 of its 1200 visible pixels to a raw NDJSON slab and say nothing
 * else about the step, while opening the very same run in the Live Console showed a result line, an
 * execution target, the launch command and file-change chips. A report that omits everything its own
 * console shows is strictly worse than the thing it summarises, so these blocks are the same
 * components the console renders — imported from `pages/runs/runDetailParts.tsx` rather than
 * reimplemented, which is what keeps the two surfaces from drifting again.
 *
 * The badges, name, timestamps and duration stay on the step card's own header; repeating them here
 * would only restate the row this sits inside. What is added is what the step record does not carry:
 * the run's narrative result, its exit code, its command, and its commits and file changes.
 */
export function StepRunDetail({
	runId,
	sessionErrorMessage,
	step,
}: {
	runId: string;
	sessionErrorMessage: null | string;
	step: PipelineStepResultRecord;
}) {
	// One small row per executed step. The step's run OUTPUT is still fetched lazily behind the
	// Console disclosure — that is the payload worth deferring; a run record is a single row.
	const query = useRunRecord(runId, true);
	const run = query.data;
	if (!run) return null;

	const result = run.aiSummary ?? run.summary;
	return (
		<div className="mt-3 space-y-3">
			{result ? (
				// The step's AI summary is the one paragraph of running prose on this page, and it
				// was setting at the full report width. The error message below stays uncapped:
				// it is machine output as often as it is a sentence.
				<p className={`text-sm break-words text-foreground ${proseMeasureClass}`}>
					{result}
				</p>
			) : null}
			<dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
				<MetadataItem label="Mode" mono value={run.mode} />
				{/* No Duration here. The docstring above says the step card's own header keeps the
				    timestamps and the duration, and this grid printed `step.durationMs` anyway —
				    the same value the header prints two lines up, from the same field. Measured at
				    2250x1309 it was worse than a restatement: the header renders it in the sans
				    face and `MetadataItem mono` rendered it in Geist Mono, so one page showed
				    `5m 18s` twice, 200px apart, in two typefaces. The header is the one that keeps
				    it, because it is the one the docstring already assigned it to. */}
				{/* The named inconsistency: the run panel prints its exit code mono and this one
				    printed the same integer in sans, one route apart. */}
				{run.exitCode !== null ? (
					<MetadataItem label="Exit code" mono value={String(run.exitCode)} />
				) : null}
				{/* The guard already excluded the narrative above; it now also excludes the two
				    error sentences that carry the same text. `run.summary` on a failed run is
				    usually the step's `errorMessage` word for word, and that sentence has already
				    been read once at the top of the report as the session's Status detail — so
				    RESULT was the third printing of it, not a record. */}
				{run.summary &&
				run.summary !== result &&
				run.summary !== step.errorMessage &&
				run.summary !== sessionErrorMessage ? (
					<MetadataItem className="col-span-full" label="Result" value={run.summary} />
				) : null}
			</dl>
			<RunCommandBlock command={run.launchCommand} runId={run.id} />
			<RunCommitsSection run={run} />
		</div>
	);
}
