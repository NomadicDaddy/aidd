import type { RunRecord } from '../../api/types.ts';

import { useRunLiveOutput } from '../../hooks/useRunLiveOutput.ts';
import { LiveConsole, type LiveConsoleBadge } from './LiveConsole.tsx';
import { extractStopDetail } from './stopDetail.ts';

// Owns the live-output subscription and all of its derived view state. Keeping this in its own
// component (rather than in useRunsPage) confines per-chunk streaming re-renders to the console
// card and keeps the run-launch form, filters, and run table responsive during a live run.
export function LiveConsolePanel({
	selectedRun,
	selectedRunId,
}: {
	selectedRun: RunRecord | undefined;
	selectedRunId: string | undefined;
}) {
	const output = useRunLiveOutput(
		selectedRun?.canReadOutput ? selectedRunId : undefined,
		selectedRun?.status,
	);
	// Drives whether the console's operator controls (find/copy/wrap/jump) render: they are only
	// meaningful when there is real transcript text, not a placeholder/status message.
	const liveConsoleHasOutput = Boolean(output.text);
	const selectedRunIsTerminal = selectedRun !== undefined && selectedRun.status !== 'running';

	const liveConsoleMessage = ((): string => {
		if (!selectedRunId) return 'Select a run to view output.';
		if (selectedRun && !selectedRun.canReadOutput) {
			return 'Live output is available only for UI-launched runs.';
		}
		if (output.text) return output.text;
		if (output.state === 'unavailable') {
			return output.reason ?? 'Run output is unavailable.';
		}
		if (output.state === 'cli-only') {
			return output.reason ?? 'Live output is available only for UI-launched runs.';
		}
		if (output.state === 'empty') {
			if (selectedRun?.status === 'failed') {
				return (
					selectedRun.errorMessage ??
					selectedRun.summary ??
					'Run failed before producing any output.'
				);
			}
			// An empty log does not mean the run finished: process-based backends (codex,
			// claude-code) stream their transcript late, so the log can be 0 bytes for minutes
			// while the run is alive and writing files. Only show the terminal "no work" copy once
			// the run has actually reached a terminal state; a still-running run shows a waiting
			// affordance instead of looking finished.
			if (!selectedRunIsTerminal) return 'Waiting for run output…';
			if (selectedRun?.summary) return selectedRun.summary;
			return 'Run completed without producing any console output (for example, when there was no work to do).';
		}
		if (selectedRunIsTerminal && !output.isStreaming && !output.isLoading) {
			return 'Run output is unavailable.';
		}
		return 'Waiting for run output…';
	})();

	// The full raw log is already in the browser via useRunLiveOutput; pull the run's last
	// agent message out of it so the detail panel can show "why" without the operator
	// scrolling the JSONL. Only meaningful once the run is terminal. Plain expression: the
	// React Compiler memoizes it per its inputs, so the scan runs once per new-output frame.
	const stopDetail = selectedRunIsTerminal ? extractStopDetail(output.text) : null;

	const liveConsoleBadge = ((): LiveConsoleBadge | null => {
		if (!selectedRun) return null;
		if (!selectedRun.canReadOutput) return { label: 'unavailable', tone: 'neutral' };
		if (output.isStreaming) return { label: 'streaming', tone: 'teal' };
		if (output.state === 'unavailable' || output.state === 'cli-only') {
			return { label: 'unavailable', tone: 'neutral' };
		}
		if (output.state === 'empty') {
			if (!selectedRunIsTerminal) return { label: 'waiting', tone: 'teal' };
			return { label: 'empty', tone: 'neutral' };
		}
		return null;
	})();

	return (
		<LiveConsole
			badge={liveConsoleBadge}
			hasOutput={liveConsoleHasOutput}
			hasSelection={selectedRunId !== undefined}
			message={liveConsoleMessage}
			selectedRun={selectedRun}
			sourceTotalBytes={output.totalBytes}
			stopDetail={stopDetail}
		/>
	);
}
