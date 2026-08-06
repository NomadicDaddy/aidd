import type { PipelineStepResultRecord } from '../../api/types.ts';

import { useRunRecord } from '../../hooks/useRuns.ts';
import { formatDuration } from '../../lib/formatters.ts';
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
export function StepRunDetail({ runId, step }: { runId: string; step: PipelineStepResultRecord }) {
	// One small row per executed step. The step's run OUTPUT is still fetched lazily behind the
	// Console disclosure — that is the payload worth deferring; a run record is a single row.
	const query = useRunRecord(runId, true);
	const run = query.data;
	if (!run) return null;

	const result = run.aiSummary ?? run.summary;
	return (
		<div className="mt-3 space-y-3">
			{result ? <p className="text-sm break-words text-foreground">{result}</p> : null}
			<dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
				<MetadataItem label="Mode" value={run.mode} />
				<MetadataItem
					label="Duration"
					value={formatDuration(step.durationMs ?? run.durationMs)}
				/>
				{run.exitCode !== null ? (
					<MetadataItem label="Exit code" value={String(run.exitCode)} />
				) : null}
				{run.summary && run.summary !== result ? (
					<MetadataItem className="col-span-full" label="Result" value={run.summary} />
				) : null}
			</dl>
			<RunCommandBlock command={run.launchCommand} runId={run.id} />
			<RunCommitsSection run={run} />
		</div>
	);
}
