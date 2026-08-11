import { default as ChevronRight } from 'lucide-react/dist/esm/icons/chevron-right';
import { useEffect, useState } from 'react';

import type { PipelineStepStatus } from '../../api/types.ts';

import { StatusDot } from '../../components/ui/badge.tsx';
import { Button } from '../../components/ui/button.tsx';
import { useRunLiveOutput } from '../../hooks/useRunLiveOutput.ts';
import { LogPre } from './LogPre.tsx';
import { StepOutput } from './StepOutput.tsx';

/** Map a pipeline step status to a RunStatus for the live-output hook. */
function stepToRunStatus(status: PipelineStepStatus) {
	return status === 'running' ? ('running' as const) : ('completed' as const);
}

/**
 * Inner component that mounts the live-output hook only when rendered.
 * This avoids fetching run output for every collapsed step on page load.
 */
function RunConsoleContent({
	onStreamingChange,
	runId,
	stepStatus,
}: {
	onStreamingChange: (streaming: boolean) => void;
	runId: string;
	stepStatus: PipelineStepStatus;
}) {
	const output = useRunLiveOutput(runId, stepToRunStatus(stepStatus));
	const text = output.text;
	const hasContent = text.length > 0;
	const display = hasContent
		? text
		: output.isLoading
			? 'Loading run output…'
			: 'No run output available.';

	// Sync streaming state to parent for the toggle indicator.
	useEffect(() => {
		onStreamingChange(output.isStreaming);
	}, [output.isStreaming, onStreamingChange]);

	return (
		// `expandable` here and not on `StepOutput`: that one truncates its own content and owns a
		// toggle already. This slab is the whole transcript, capped only by height, and a running
		// step's console is the one place where reading past the cap is the point.
		<LogPre caption="Run console output" className="mt-2" expandable>
			{display}
		</LogPre>
	);
}

/**
 * Every log surface for one step, behind one disclosure.
 *
 * The step's persisted output summary used to be the DEFAULT content of the card — a raw NDJSON slab
 * taking most of the page, above a second, visually identical slab holding the same run's console.
 * Both are transcripts, so both belong in the same place, and that place is closed: what a step did
 * is the structured detail above this, and the transcript is what you open when that is not enough.
 *
 * The output hook is mounted lazily — only once the disclosure has been expanded — so a completed
 * session with a dozen steps does not fire a dozen transcript fetches on page load.
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
	const [open, setOpen] = useState(stepStatus === 'running');
	const [mounted, setMounted] = useState(stepStatus === 'running');
	const [streaming, setStreaming] = useState(false);

	const handleToggle = () => {
		const next = !open;
		setOpen(next);
		if (next) setMounted(true);
	};

	// A step with neither a transcript nor a run has nothing to disclose, and an empty toggle reads
	// as output that failed to load.
	if (!outputSummary && !runId) return null;

	return (
		<div className="mt-3">
			<Button
				aria-expanded={open}
				className="-ml-2"
				onClick={handleToggle}
				size="compact"
				variant="ghost">
				<ChevronRight
					aria-hidden="true"
					className={`h-4 w-4 transition-transform ${open ? 'rotate-90' : ''}`}
				/>
				<span className="flex items-center gap-2">
					Console
					{streaming && <StatusDot pulse tone="teal" />}
				</span>
			</Button>
			{open ? (
				<>
					{/* The persisted summary is a fallback, not a companion. Where the step has a
					    run, the console below fetches that run's full transcript and the summary is
					    a truncated copy of its head — so opening the disclosure produced two
					    visually identical slabs, the second containing the first. It renders only
					    where there is no run to fetch from, which is the case it exists for. */}
					{outputSummary && !runId ? <StepOutput output={outputSummary} /> : null}
					{runId && mounted ? (
						<RunConsoleContent
							onStreamingChange={setStreaming}
							runId={runId}
							stepStatus={stepStatus}
						/>
					) : null}
				</>
			) : null}
		</div>
	);
}
