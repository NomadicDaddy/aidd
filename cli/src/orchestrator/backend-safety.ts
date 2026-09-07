import type { AgentEvent } from 'aidd-shared/backends/types';

import {
	FlailingDetector,
	formatFlailingSignature,
	isFlailingGuardDisabled,
} from 'aidd-shared/backends/flailing';
import { ChildProcessReaper, type ReapDiagnostic } from 'aidd-shared/lib/childProcessReaper';

export interface BackendSafetyOptions {
	/** Controller whose signal feeds monitorBackend for this backend invocation. */
	controller: AbortController;
	/** Where flailing warn/trip lines go (the run log in the coding path, stdout in
	 * triumvirate stages). */
	onLogLine?: (line: string) => Promise<void> | void;
	/** Optional outer run-level signal, relayed into `controller` so a run-wide stop or
	 * abort also ends the in-flight backend. The relay is removed at teardown. */
	runSignal?: AbortSignal;
	runStartedAtMs: number;
	/** `plan.outputPolicy.timeoutSeconds * 1000`. */
	wallClockTimeoutMs: number;
}

// The safety envelope every backend invocation runs inside, shared by the single-agent
// stream loop (run/backend-stream.ts) and triumvirate stages (triumvirate/stage-execution.ts)
// so the two paths cannot drift:
//
// - Wall-clock deadline: a continuously-emitting runaway agent never trips the idle-based
//   abort inside monitorBackend; the timer fires at runStartedAtMs + wallClockTimeoutMs
//   regardless of event activity and aborts with 'wall_clock_timeout'.
// - Flailing guard: an agent stuck repeating the same diagnostic/lifecycle shell commands
//   without file changes never goes idle either; the detector watches the tool-call stream
//   and aborts with 'flailing'. Opt out with AIDD_DISABLE_FLAILING_GUARD=1.
// - Child-process reaper: a verification/dev server the agent starts and fails to stop
//   outlives the backend (Windows breakaway spawns escape the job object; POSIX detached
//   grandchildren leave the process group) and keeps holding its listen port. The reaper
//   snapshots the pid/ppid table while the backend runs and kills surviving descendants
//   after it exits.
export class BackendSafetyEnvelope {
	flailingDetected = false;
	wallClockTimedOut = false;

	private readonly detector: FlailingDetector | undefined;
	private readonly options: BackendSafetyOptions;
	private reapDiagnostic: ReapDiagnostic | undefined;
	private readonly reaper: ChildProcessReaper;
	private relay: (() => void) | undefined;
	private timer: ReturnType<typeof setTimeout> | undefined;

	constructor(options: BackendSafetyOptions) {
		this.options = options;
		this.detector = isFlailingGuardDisabled() ? undefined : new FlailingDetector();
		this.reaper = new ChildProcessReaper({
			onReap: (diagnostic) => {
				this.reapDiagnostic = diagnostic;
			},
			// Our own launcher, named directly rather than left to the ancestry walk. A detached
			// run hangs off a relauncher that is itself orphaned onto the pid of a launch shell
			// which exited seconds after spawning it, so the chain above us is exactly where a
			// reissued pid does the most damage: reaping through it killed the run doing the work.
			protectedPids: [process.ppid],
		});
	}

	/** Start the wall-clock timer and the run-signal relay. Call before consuming events. */
	arm(): void {
		const { controller, runSignal, runStartedAtMs, wallClockTimeoutMs } = this.options;
		if (runSignal) {
			if (runSignal.aborted) {
				controller.abort(runSignal.reason ?? 'run_aborted');
			} else {
				this.relay = () => controller.abort(runSignal.reason ?? 'run_aborted');
				runSignal.addEventListener('abort', this.relay, { once: true });
			}
		}
		const remainingMs = runStartedAtMs + wallClockTimeoutMs - Date.now();
		if (remainingMs <= 0) {
			this.wallClockTimedOut = true;
			controller.abort('wall_clock_timeout');
			return;
		}
		this.timer = setTimeout(() => {
			this.wallClockTimedOut = true;
			controller.abort('wall_clock_timeout');
		}, remainingMs);
	}

	/** Feed every persisted event. Returns 'abort_flailing' when the detector trips so the
	 * caller can break its loop (the envelope has already aborted the controller). */
	async observe(event: AgentEvent): Promise<'abort_flailing' | 'continue'> {
		// Only external-process backends report a pid. The in-process native backend's tool
		// children are direct children of the orchestrator, indistinguishable by ppid from
		// the CLI's own git/doctor spawns — tracking them would risk reaping our own
		// in-flight subprocesses, so pid-less backends are not tracked.
		if (event.type === 'started' && event.pid !== undefined) this.reaper.attach(event.pid);
		if (event.type === 'tool_call') this.reaper.noteActivity();
		if (this.detector) {
			const signal = this.detector.record(event);
			if (signal.kind === 'warn') {
				await this.options.onLogLine?.(
					`⚠ possible flailing (${signal.reason}, ×${signal.count}): ${formatFlailingSignature(signal.signature)}`,
				);
			} else if (signal.kind === 'trip') {
				this.flailingDetected = true;
				await this.options.onLogLine?.(
					`✋ flailing detected (${signal.reason}, ×${signal.count}): ${formatFlailingSignature(signal.signature)} — aborting iteration`,
				);
				this.options.controller.abort('flailing');
				return 'abort_flailing';
			}
		}
		return 'continue';
	}

	/** Clear the timer, detach the run-signal relay, and reap leaked children. Must run on
	 * every exit path (finally). Returns the reap report line for the caller to print, or
	 * undefined when nothing was reaped. */
	async teardown(): Promise<string | undefined> {
		if (this.timer !== undefined) clearTimeout(this.timer);
		if (this.relay) this.options.runSignal?.removeEventListener('abort', this.relay);
		const reapedPids = await this.reaper.reap();
		if (reapedPids.length === 0) return undefined;
		// Says which table the decision came from: the stale-snapshot path only runs when
		// the teardown probe failed, and how often that happens is worth knowing.
		const source = this.reapDiagnostic?.usedStaleTable
			? ` (from a ${Math.round(this.reapDiagnostic.tableAgeMs / 1000)}s-old snapshot: the teardown process-table probe timed out)`
			: '';
		// Image name and parent, not bare pids: the numbers are meaningless by the time anyone
		// reads the line, and a reap that killed the wrong tree is indistinguishable from a good
		// one without them. This is the log that has to answer "what did it actually kill?".
		const victims = this.reapDiagnostic?.victims ?? [];
		const detail =
			victims.length === reapedPids.length
				? victims
						.map(
							(victim) =>
								`${victim.pid} (${victim.image ?? 'unknown'}, ppid ${victim.ppid})`,
						)
						.join(', ')
				: reapedPids.join(', ');
		return `♻ reaped ${reapedPids.length} leaked child process(es) at teardown${source}: ${detail}\n`;
	}
}
