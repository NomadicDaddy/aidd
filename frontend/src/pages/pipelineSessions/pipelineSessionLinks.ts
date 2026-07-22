export function pipelineStepLiveConsoleHref(runId: string): string {
	return `/runs?run=${encodeURIComponent(runId)}`;
}
