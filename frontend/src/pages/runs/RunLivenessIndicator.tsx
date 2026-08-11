import type { RunRecord } from '../../api/types.ts';

import { StatusDot } from '../../components/ui/badge.tsx';
import { type Tone } from '../../lib/tones.ts';
import {
	formatActivityState,
	formatHeartbeatAge,
	runLiveness,
	type RunLiveness,
} from './runRowUtils.ts';

const LIVENESS_TONE: Record<RunLiveness, Tone> = {
	idle: 'amber',
	live: 'emerald',
	stalled: 'red',
	unknown: 'neutral',
};

function livenessLabel(liveness: RunLiveness, ageMs: null | number): string {
	const age = ageMs === null ? '' : ` ${formatHeartbeatAge(ageMs)}`;
	switch (liveness) {
		case 'idle':
			return `No heartbeat${age}`;
		case 'live':
			return 'Live';
		case 'stalled':
			return `Stalled${age}`;
		case 'unknown':
			return 'Starting…';
	}
}

/**
 * At-a-glance liveness for an active run: a colored dot (green ticking = healthy, amber = no
 * recent heartbeat, red = stalled past the reap threshold) plus the heartbeat age and the
 * agent's current activity. This is what lets a healthy long-running run be told apart from a
 * hung one without reading logs or inspecting the process. Renders nothing for terminal runs.
 */
export function RunLivenessIndicator({ now, run }: { now: number; run: RunRecord }) {
	if (run.status !== 'running') return null;
	const liveness = runLiveness(run, now);
	const ageMs = run.heartbeatAt === null ? null : Math.max(0, now - run.heartbeatAt);
	const activity = formatActivityState(run.activityState);
	const title =
		ageMs === null
			? 'No heartbeat received yet'
			: `Last heartbeat ${formatHeartbeatAge(ageMs)} ago`;
	return (
		<div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
			<span className="inline-flex items-center gap-1" title={title}>
				<StatusDot pulse={liveness === 'live'} tone={LIVENESS_TONE[liveness]} />
				<span>{livenessLabel(liveness, ageMs)}</span>
			</span>
			{activity ? <span className="text-muted-foreground">· {activity}</span> : null}
		</div>
	);
}
