import { useState } from 'react';

import type { PipelineStepStatus } from '../../api/types.ts';

import { DisclosureMarker } from '../../components/shared/DisclosureMarker.tsx';
import { StatusDot } from '../../components/ui/badge.tsx';
import { Button } from '../../components/ui/button.tsx';
import { useRunLiveOutput } from '../../hooks/useRunLiveOutput.ts';
import { useRunRecord } from '../../hooks/useRuns.ts';
import { RunConsoleBody } from './RunConsoleBody.tsx';
import { consoleSourceId, initialDisclosure, toggleDisclosure } from './stepConsoleDisclosure.ts';
import { StepOutput } from './StepOutput.tsx';

/** Map a pipeline step status to a RunStatus for the live-output hook. */
function stepToRunStatus(status: PipelineStepStatus) {
	return status === 'running' ? ('running' as const) : ('completed' as const);
}

/** The toggle's label, split out so the streaming dot is renderable without a live subscription. */
export function ConsoleToggleLabel({ streaming }: { streaming: boolean }) {
	return (
		<span className="flex items-center gap-2">
			Console
			{streaming && <StatusDot pulse tone="teal" />}
		</span>
	);
}

/**
 * Every log surface for one step, behind one disclosure.
 *
 * The step's persisted output summary is NOT the default content of the card: as one it is a raw
 * NDJSON slab taking most of the page, above a second, visually identical slab holding the same
 * run's console. Both are transcripts, so both belong in the same place, and that place is closed:
 * what a step did is the structured detail above this, and the transcript is what you open when
 * that is not enough.
 *
 * This component is the single authority on the step's live output: it holds the disclosure, the
 * subscription, the streaming dot, and the expanded body, so the dot renders from
 * `output.isStreaming` directly rather than from a copy an effect pushed up out of a child.
 *
 * Laziness is expressed as *what is fetched*, not as what is mounted. Until the disclosure has
 * been opened, `consoleSourceId` returns undefined, which disables both queries and leaves the
 * socket handler inert — so a completed session with a dozen collapsed steps still fires zero
 * transcript requests on page load. Doing it this way rather than by swapping in a subcomponent
 * on first open keeps the toggle's DOM identity, and with it the keyboard focus sitting on it at
 * the moment of the click. After a re-collapse the subscription stays: that is what lets the dot
 * on a closed toggle keep telling the truth about a run that is still streaming.
 */
export function StepRunConsole({
	outputSummary,
	runId,
	stepStatus,
}: {
	outputSummary: null | string;
	runId: null | string;
	stepStatus: PipelineStepStatus;
}) {
	const [disclosure, setDisclosure] = useState(() => initialDisclosure(stepStatus));
	const sourceId = consoleSourceId(disclosure, runId);
	const output = useRunLiveOutput(sourceId, stepToRunStatus(stepStatus));
	const run = useRunRecord(runId ?? undefined, sourceId !== undefined);

	const handleToggle = () => setDisclosure(toggleDisclosure);

	// A step with neither a transcript nor a run has nothing to disclose, and an empty toggle reads
	// as output that failed to load.
	if (!outputSummary && !runId) return null;

	return (
		<div className="mt-3">
			<Button
				aria-expanded={disclosure.open}
				className="-ml-2"
				onClick={handleToggle}
				size="compact"
				variant="ghost">
				<DisclosureMarker open={disclosure.open} />
				<ConsoleToggleLabel streaming={output.isStreaming} />
			</Button>
			{disclosure.open ? (
				<>
					{/* The persisted summary is a fallback, not a companion. Where the step has a
					    run, the console below fetches that run's full transcript and the summary is
					    a truncated copy of its head — so opening the disclosure produced two
					    visually identical slabs, the second containing the first. It renders only
					    where there is no run to fetch from, which is the case it exists for. */}
					{outputSummary && !runId ? <StepOutput output={outputSummary} /> : null}
					{sourceId ? (
						<RunConsoleBody backend={run.data?.backend} output={output} />
					) : null}
				</>
			) : null}
		</div>
	);
}
