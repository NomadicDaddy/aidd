import { default as ChevronRight } from 'lucide-react/dist/esm/icons/chevron-right';
import { useEffect, useState } from 'react';

import type { PipelineStepStatus } from '../../api/types.ts';

import { Button } from '../../components/ui/button.tsx';
import { useRunLiveOutput } from '../../hooks/useRunLiveOutput.ts';
import { LogPre } from './LogPre.tsx';

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
		<LogPre ariaLabel="Run console output" className="mt-2">
			{display}
		</LogPre>
	);
}

/**
 * Inline console for a pipeline step that spawned a run. Shows a collapsible
 * panel with the run's live output (WebSocket for running, HTTP snapshot otherwise).
 * The output hook is mounted lazily — only when the console is expanded — so
 * completed pipeline sessions don't fire one HTTP request per step on page load.
 */
export function StepRunConsole({
	runId,
	stepStatus,
}: {
	runId: string;
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
					{streaming && (
						<span className="inline-block h-2 w-2 animate-pulse rounded-full bg-teal-400" />
					)}
				</span>
			</Button>
			{open && mounted && (
				<RunConsoleContent
					onStreamingChange={setStreaming}
					runId={runId}
					stepStatus={stepStatus}
				/>
			)}
		</div>
	);
}
