import { classifyWebRun, type WebRunOutcomeStatus } from 'aidd-shared/runs/outcome';
import { toast } from 'sonner';

import type { LaunchedRunInfo, LaunchedRunTerminal } from '../lib/launchedRuns.ts';

/**
 * Builds and shows the completion toast for a run the user launched from the UI. Split out of
 * useLaunchedRunToasts so it can be imported on demand: the hook itself must subscribe to the
 * socket the moment the app mounts, but this — sonner and the run-outcome classifier with it — is
 * needed only once a launched run actually finishes, which is never for most sessions.
 *
 * Used for both the live path (a terminal event for an already-tracked run) and the reconcile path
 * (a buffered terminal claimed at track time, when the run finished before its launch response
 * landed).
 */
export function showLaunchedRunToast(info: LaunchedRunInfo, terminal: LaunchedRunTerminal): void {
	const outcome = classifyWebRun({
		exitCode: terminal.exitCode ?? null,
		status: terminal.status as WebRunOutcomeStatus,
		stopReason: terminal.stopReason ?? null,
		summary: terminal.summary ?? null,
	});
	const description = terminal.summary?.trim() || terminal.error?.trim() || outcome.title;
	const title = info.feature ? `${outcome.label} — ${info.feature}` : outcome.label;
	const options = { description };
	switch (outcome.tone) {
		case 'amber':
			toast.warning(title, options);
			return;
		case 'emerald':
			toast.success(title, options);
			return;
		case 'red':
			toast.error(title, options);
			return;
		default:
			toast.info(title, options);
	}
}
