// Correlates runs the user launched from the UI with their terminal run_status broadcast, so the
// realtime layer can toast the outcome — and explain *why* nothing ran — only for runs the user
// initiated. Background director/CLI/observer runs broadcast the same events but must never toast.
//
// The hard part is a race: the run id is only known once the POST /runs response resolves, but an
// instant no-work run can finish and broadcast its terminal status *before* that response lands. So
// this module buffers such "orphan" terminals briefly (only while a launch is in flight) and lets
// trackLaunchedRun() reconcile them — guaranteeing the toast even for sub-second runs.
//
// Kept free of React/sonner: the toast hook registers an emitter (setLaunchedRunEmitter) that this
// module invokes when a buffered terminal is reconciled at track time.

export interface LaunchedRunInfo {
	feature?: string;
	mode?: string;
}

// The subset of a terminal run_status payload the toast layer needs. Opaque here — the registered
// emitter interprets it (tone, label, description).
export interface LaunchedRunTerminal {
	error?: null | string;
	exitCode?: null | number;
	status: string;
	stopReason?: null | string;
	summary?: null | string;
}

type LaunchedRunEmitter = (info: LaunchedRunInfo, terminal: LaunchedRunTerminal) => void;

// Bound memory if a terminal broadcast is missed (e.g. a socket drop): the oldest entry is evicted
// past this size. A stale tracked entry only costs a missed toast; a stale orphan is pruned by TTL.
const MAX_TRACKED = 50;
// How long a pre-track terminal stays claimable. Comfortably longer than the launch round-trip, so a
// genuinely racing completion is still reconciled, while an unclaimed orphan never lingers.
const ORPHAN_TTL_MS = 15_000;

const launchedRuns = new Map<string, LaunchedRunInfo>();
const orphanTerminals = new Map<string, { at: number; terminal: LaunchedRunTerminal }>();
let inFlightLaunches = 0;
let emit: LaunchedRunEmitter | undefined;

export function setLaunchedRunEmitter(emitter: LaunchedRunEmitter | undefined): void {
	emit = emitter;
}

// Bracket the launch round-trip (onMutate → onSettled). Orphan terminals are only buffered while a
// launch is in flight, so background runs completing during normal use are never retained.
export function beginLaunch(): void {
	inFlightLaunches += 1;
}

export function endLaunch(): void {
	if (inFlightLaunches > 0) inFlightLaunches -= 1;
}

function pruneOrphans(now: number): void {
	for (const [id, entry] of orphanTerminals) {
		if (now - entry.at > ORPHAN_TTL_MS) orphanTerminals.delete(id);
	}
}

function evictOldest(map: Map<string, unknown>): void {
	if (map.size <= MAX_TRACKED) return;
	const oldest = map.keys().next().value;
	if (oldest !== undefined) map.delete(oldest);
}

// Register a UI-initiated run once its id is known (launch onSuccess). If the run already finished
// and its terminal was buffered while this launch was racing, toast it now instead of tracking.
export function trackLaunchedRun(id: string, info: LaunchedRunInfo = {}, now = Date.now()): void {
	pruneOrphans(now);
	const orphan = orphanTerminals.get(id);
	if (orphan !== undefined) {
		orphanTerminals.delete(id);
		emit?.(info, orphan.terminal);
		return;
	}
	launchedRuns.set(id, info);
	evictOldest(launchedRuns);
}

// Called by the toast hook for every terminal run_status. Returns the launch info (and stops
// tracking) if this run was user-launched; otherwise, while a launch is in flight, buffers the
// terminal so a not-yet-registered instant run can still be reconciled by trackLaunchedRun().
export function resolveLaunchedRunTerminal(
	id: string,
	terminal: LaunchedRunTerminal,
	now = Date.now(),
): LaunchedRunInfo | undefined {
	pruneOrphans(now);
	const info = launchedRuns.get(id);
	if (info !== undefined) {
		launchedRuns.delete(id);
		return info;
	}
	if (inFlightLaunches > 0) {
		orphanTerminals.set(id, { at: now, terminal });
		evictOldest(orphanTerminals);
	}
	return undefined;
}
