import { useRef, useState } from 'react';
import { toast } from 'sonner';

import type { RunOutputResponse, RunOutputWindowRequest, RunRecord } from '../../api/types.ts';

import { useRunOutputWindow } from '../../hooks/useRuns.ts';
import { describeTranscriptWindow } from './liveConsoleNavigation.ts';

export function useLiveConsoleWindow({
	message,
	selectedRun,
	sourceEndByte,
	sourceStartByte,
	sourceTotalBytes,
	windowLimitBytes,
}: {
	message: string;
	selectedRun: RunRecord | undefined;
	sourceEndByte: null | number | undefined;
	sourceStartByte: null | number | undefined;
	sourceTotalBytes: null | number | undefined;
	windowLimitBytes: null | number | undefined;
}) {
	const [storedWindow, setStoredWindow] = useState<{
		response: RunOutputResponse;
		runId: string;
	} | null>(null);
	const windowMutation = useRunOutputWindow();
	const requestVersion = useRef(0);
	const browsedWindow =
		storedWindow && storedWindow.runId === selectedRun?.id ? storedWindow.response : null;
	const displayedMessage = browsedWindow?.output ?? message;

	async function loadWindow(window: RunOutputWindowRequest): Promise<void> {
		if (!selectedRun) return;
		const version = ++requestVersion.current;
		try {
			const result = await windowMutation.mutateAsync({ id: selectedRun.id, window });
			if (version !== requestVersion.current) return;
			if (
				result.startByte === undefined ||
				result.endByte === undefined ||
				result.windowLimitBytes === undefined
			) {
				toast.error(
					'The running panel must be restarted before transcript windows are available.',
				);
				return;
			}
			setStoredWindow({ response: result, runId: selectedRun.id });
		} catch (error) {
			if (version !== requestVersion.current) return;
			toast.error(
				error instanceof Error ? error.message : 'Could not load transcript window',
			);
		}
	}

	function returnLive(): void {
		requestVersion.current++;
		setStoredWindow(null);
		windowMutation.reset();
	}

	return {
		browsedWindow,
		displayedMessage,
		isLoadingWindow: windowMutation.isPending,
		loadWindow,
		returnLive,
		transcriptWindow: describeTranscriptWindow({
			endByte: browsedWindow?.endByte ?? sourceEndByte,
			message: displayedMessage,
			startByte: browsedWindow?.startByte ?? sourceStartByte,
			totalBytes: browsedWindow?.totalBytes ?? sourceTotalBytes,
			windowLimitBytes: browsedWindow?.windowLimitBytes ?? windowLimitBytes,
		}),
	};
}
