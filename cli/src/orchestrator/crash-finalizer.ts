import { scrubSecrets } from 'aidd-shared/lib/secretScrubber';

import type { CliActiveRunHeartbeat } from './active-run-heartbeat.ts';

// Give the terminal heartbeat + fallback ledger write a bounded window on a crash path;
// past it, exiting with stale metadata beats hanging a dead process forever.
const CRASH_FINALIZE_TIMEOUT_MS = 3000;

let crashFinalizerInstalled = false;
// Rebindable target: process handlers are installed once, but repeated run() calls in one
// process (tests, embedding) must finalize the CURRENT run's heartbeat, not the first one —
// a disposed first heartbeat would no-op and leave the live run's records frozen mid-flight.
let crashFinalizerTarget: CliActiveRunHeartbeat | null = null;

// Last-resort finalization for hard process deaths the normal try/finally in app.ts never
// sees: an unhandled rejection or uncaught exception kills Bun without unwinding suspended
// async frames, so heartbeat.dispose() would not run. Observed as a run whose backend
// completed (work committed) while the CLI died pre-finalization — the web reaped it as
// heartbeat_stale with no ledger entry and an iteration record stuck at lifecycle=started.
// This handler writes the terminal 'failed' heartbeat (which also appends the fallback
// runs.jsonl entry) with the crash detail, then exits non-zero.
export function installCrashFinalizer(heartbeat: CliActiveRunHeartbeat): void {
	crashFinalizerTarget = heartbeat;
	if (crashFinalizerInstalled) return;
	crashFinalizerInstalled = true;
	process.once('uncaughtException', (err) => {
		void finalizeCrashedRun('uncaughtException', err);
	});
	process.once('unhandledRejection', (reason) => {
		void finalizeCrashedRun('unhandledRejection', reason);
	});
}

// Exported for tests (which inject exit — process.exit would kill the test runner). Crash
// text is scrubbed before it reaches the console or the persisted heartbeat summary: error
// messages routinely embed env/config fragments the normal event path already scrubs.
export async function finalizeCrashedRun(
	kind: string,
	cause: unknown,
	// Called through an arrow rather than passed as `process.exit` directly, so the receiver is
	// never dropped. Node happens to close over `process` today, but that is an implementation
	// detail of the runtime, not part of the documented contract.
	exit: (code: number) => void = (code) => process.exit(code),
): Promise<void> {
	const heartbeat = crashFinalizerTarget;
	const detail = scrubSecrets(
		cause instanceof Error ? (cause.stack ?? cause.message) : String(cause),
	);
	console.error(`[aidd] fatal ${kind}; finalizing run metadata before exit:\n${detail}`);
	heartbeat?.noteFatalError(
		scrubSecrets(`${kind}: ${cause instanceof Error ? cause.message : String(cause)}`),
	);
	const timeout = new Promise<void>((resolveTimeout) => {
		setTimeout(resolveTimeout, CRASH_FINALIZE_TIMEOUT_MS);
	});
	await Promise.race([heartbeat?.dispose(), timeout]).catch(() => {});
	exit(1);
}
