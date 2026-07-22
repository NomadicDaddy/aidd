// Process / step cleanup timeouts shared across runService and pipeline session lifecycle.
// Centralized here so the "wait for child to exit after kill" delay has a single tuning knob
// instead of three different literals scattered across files.

export const PROCESS_CLEANUP_TIMEOUT_MS = 2000;
export const STEP_CLEANUP_TIMEOUT_MS = 1000;

// Absolute backstop for a pipeline step waiting on a launched run to reach a terminal status.
// The session stop flag is the primary cancellation path; this bound only exists so a step
// cannot block a pipeline session forever on a run row that never becomes terminal (e.g. an
// orphaned 'running' row left by an out-of-band process kill that startup reconciliation did
// not catch). Deliberately generous so it never aborts a legitimately long coding run.
export const RUN_WAIT_MAX_MS = 6 * 60 * 60 * 1000;
