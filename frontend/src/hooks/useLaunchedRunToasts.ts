import type { WebRunOutcomeStatus } from 'aidd-shared/runs/outcome';

import { useEffect } from 'react';

import {
	type LaunchedRunInfo,
	type LaunchedRunTerminal,
	resolveLaunchedRunTerminal,
	setLaunchedRunEmitter,
} from '../lib/launchedRuns.ts';
import { type SocketMessage, useWebSocketSubscribe } from './useWebSocket.ts';

// Statuses that warrant a completion toast. Stopped/killed runs were ended by the user on purpose,
// so they need no toast (the action already gave feedback); a 'running' transition is not terminal.
const TOASTED_STATUSES = new Set<WebRunOutcomeStatus>(['completed', 'failed']);

interface RunStatusPayload {
	error?: null | string;
	exitCode?: null | number;
	status?: string;
	stopReason?: null | string;
	summary?: null | string;
}

function readPayload(payload: unknown): null | RunStatusPayload {
	if (typeof payload !== 'object' || payload === null) return null;
	return payload;
}

// Show the toast for a resolved user-launched run. The toast itself lives in its own module —
// sonner and the outcome classifier together are ~7 KB of gzip that the shell would otherwise put
// on every first paint — and is fetched the first time a launched run finishes.
function showLaunchedRunToast(info: LaunchedRunInfo, terminal: LaunchedRunTerminal): void {
	void import('./launchedRunToast.ts').then((module) => {
		module.showLaunchedRunToast(info, terminal);
	});
}
function notify(message: SocketMessage): void {
	if (message.type !== 'run_status') return;
	const runId = message.runId;
	if (!runId) return;
	const payload = readPayload(message.payload);
	const status = payload?.status;
	if (!status || !TOASTED_STATUSES.has(status as WebRunOutcomeStatus)) return;
	const terminal: LaunchedRunTerminal = {
		error: payload?.error ?? null,
		exitCode: payload?.exitCode ?? null,
		status,
		stopReason: payload?.stopReason ?? null,
		summary: payload?.summary ?? null,
	};
	// Only toast for runs the user launched from the UI. If the run isn't tracked yet it may be an
	// instant run whose launch response is still in flight — resolveLaunchedRunTerminal buffers it so
	// trackLaunchedRun() reconciles it (firing showLaunchedRunToast via the emitter below).
	const info = resolveLaunchedRunTerminal(runId, terminal);
	if (info !== undefined) showLaunchedRunToast(info, terminal);
}

// Surfaces a completion toast for runs the user launched from the UI. Mounted once at the app root
// (alongside useRealtimeInvalidation) so it sees every run_status broadcast. The "no work" case now
// carries the specific selection reason in `summary` (e.g. a roadmap-milestone gate), so a run that
// finishes instantly with nothing to do explains itself instead of silently vanishing into history.
export function useLaunchedRunToasts(): void {
	useEffect(() => {
		setLaunchedRunEmitter(showLaunchedRunToast);
		return () => setLaunchedRunEmitter(undefined);
	}, []);
	useWebSocketSubscribe(notify);
}
