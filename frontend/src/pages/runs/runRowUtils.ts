import type { MouseEvent } from 'react';

import type { RunRecord } from '../../api/types.ts';

export type RunLiveness = 'idle' | 'live' | 'stalled' | 'unknown';

// Split so a selected container keeps the pointer affordance without a hover tint fighting its
// selected background.
export const containerSelectableClass = 'cursor-pointer';
export const containerHoverClass = 'hover:bg-muted';
// One definition for the four surfaces that render a selected execution (desktop run row, mobile
// run card, session row, step sub-row). The inset bar is already token-driven; the fill now is too,
// so the selected state re-themes instead of staying a fixed teal wash.
export const containerSelectedClass =
	'bg-accent-muted shadow-[inset_4px_0_0_var(--accent)]' as const;

// The NAME column's fixed leading slot. Run rows render it empty, single-step sessions render the
// Workflow icon and multi-step sessions render the expand chevron — reserving the width on every
// row is what keeps the three row types sharing one left edge.
export const leadingSlotClass = 'flex w-6 shrink-0 items-center justify-center' as const;

// Pointer-only convenience target. The row/card is not focusable and emulates no keys, so it adds
// neither a tab stop nor a second accessible control — ConsoleSelectionButton stays the semantic
// selection control. Clicks landing on a nested link or button belong to that control instead.
export function containerSelectionHandler(
	onSelect: () => void,
): (event: MouseEvent<HTMLElement>) => void {
	return (event) => {
		if ((event.target as HTMLElement).closest('a,button')) return;
		onSelect();
	};
}

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

// A failure reason is the one cell whose value the reader came for, and it lands in the STATUS
// column — the narrowest column that carries free text. It used to be a single `truncate` line
// capped at 16rem with the full text nowhere: roughly a ninth of a sentence, and no tooltip in the
// ancestry to recover the rest. Two lines is what the column can give without taking width off the
// execution identity beside it, and the `title` carries the whole of it. Rows carrying one always
// pair this class with `title={message}`.

export function runRuntimeDetail(run: RunRecord): string {
	return run.mode ? `mode ${run.mode}` : '—';
}

// The selection button shows the run mode, so WCAG 2.5.3 (Label in Name) requires that same text
// inside the accessible name — a name built only from the project name would not match what a
// speech-input user reads on screen. Shared so desktop rows and mobile cards cannot drift.
// `mode` is widened past RunRecord's non-nullable field to match the `?? 'Run'` fallback the rows
// already carry for payloads from a backend that predates the field.
export function consoleSelectionLabel(run: {
	mode: null | RunRecord['mode'];
	projectName: string;
}): string {
	return `Show ${run.mode ?? 'Run'} for ${run.projectName} in Live Console`;
}

export function runSourceLabel(run: Pick<RunRecord, 'source'>): string {
	if (run.source === 'cli') return 'CLI';
	if (run.source === 'director') return 'Director';
	return 'Web';
}
