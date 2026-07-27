import type { RunRecord } from '../../api/types.ts';

export type RunLiveness = 'idle' | 'live' | 'stalled' | 'unknown';

// Thresholds tuned to the 15s active-runs poll (ACTIVE_RUNS_POLL_MS): a healthy run's heartbeat
// age never exceeds roughly one poll interval plus jitter between refreshes, so 'live' must sit
// comfortably above 15s to avoid false amber. 'stalled' matches the backend's
// CLI_ACTIVE_RUN_STALE_MS (120s) — exactly when the backend reaps the run to 'failed'.
const LIVE_MAX_AGE_MS = 45_000;
const STALLED_MIN_AGE_MS = 120_000;

export function runLiveness(run: RunRecord, now: number): RunLiveness {
	if (run.status !== 'running' || run.heartbeatAt === null) return 'unknown';
	const age = now - run.heartbeatAt;
	if (age <= LIVE_MAX_AGE_MS) return 'live';
	if (age < STALLED_MIN_AGE_MS) return 'idle';
	return 'stalled';
}

// The CLI heartbeat state is a compact machine string (e.g. 'agent:tool_call'); render it as a
// short human phrase ('tool call') for the at-a-glance current-activity line.
export function formatActivityState(state: null | string): null | string {
	if (!state) return null;
	const trimmed = state
		.replace(/^agent:/, '')
		.replaceAll('_', ' ')
		.trim();
	return trimmed.length > 0 ? trimmed : null;
}

export function formatHeartbeatAge(ms: number): string {
	const seconds = Math.max(0, Math.round(ms / 1000));
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.floor(seconds / 60);
	return `${minutes}m ${seconds % 60}s`;
}

export function runRuntimeDetail(run: RunRecord): string {
	return run.mode ? `mode ${run.mode}` : '—';
}

export function runSourceLabel(run: Pick<RunRecord, 'source'>): string {
	if (run.source === 'cli') return 'CLI';
	if (run.source === 'director') return 'Coordinator';
	return 'Web';
}
