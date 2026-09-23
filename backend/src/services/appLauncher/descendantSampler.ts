import { type CapturedDescendant, captureDescendants } from 'aidd-shared/lib/processTree';

/** How often a settled app's process tree is re-sampled, so an exit has a recent snapshot. */
const DESCENDANT_SAMPLE_MS = 15_000;
/**
 * Extra samples over the first seconds, when the tree is both changing fastest and most likely to
 * vanish: a command that fails on startup spawns its servers and dies inside a second, far short
 * of the settled cadence, and that is exactly the crash that strands a server on a port.
 */
const EARLY_SAMPLE_DELAYS_MS = [250, 750, 1_500, 3_000, 6_000] as const;

/**
 * Keeps a recent picture of what each launched app is running underneath it.
 *
 * Sampling rather than enumerating at exit, because a launch command is usually a chain: `bun run
 * dev` starts a script, the script starts the servers detached. By the time the command exits the
 * middle of that chain is gone and the servers' parent links name a dead process, so nothing
 * reachable from the launched pid finds them. A snapshot taken while the chain was intact still
 * names them, which is what lets the exit sweep kill an orphaned dev server instead of leaving it
 * holding a port.
 *
 * The limit of that: a command that spawns and dies inside the first sample leaves nothing to
 * sample, so anything it detached survives. That is a start-up failure, where the servers rarely
 * got far enough to hold a port; the case this exists for is the app that served for hours and
 * then died.
 */
export class DescendantSampler {
	private readonly samples = new Map<string, CapturedDescendant[]>();
	private readonly timers = new Map<string, ReturnType<typeof setInterval>>();
	private readonly earlyTimers = new Map<string, ReturnType<typeof setTimeout>[]>();
	private readonly isLive: (projectPath: string) => boolean;

	constructor(isLive: (projectPath: string) => boolean) {
		this.isLive = isLive;
	}

	/**
	 * Begins sampling the tree under a launched app.
	 *
	 * An immediate sample catches a command that dies at once; the interval keeps up with servers
	 * that appear later, which is the usual case. The timer is unref'd so it never holds the
	 * panel open.
	 * @param projectPath The launched project.
	 * @param pid The launched process.
	 */
	start(projectPath: string, pid: number): void {
		const sample = async (): Promise<void> => {
			if (!this.isLive(projectPath)) return;
			const descendants = await captureDescendants(pid);
			if (descendants.length > 0) this.samples.set(projectPath, descendants);
		};
		void sample();
		const early = EARLY_SAMPLE_DELAYS_MS.map((delay) => {
			const timer = setTimeout(() => void sample(), delay);
			timer.unref?.();
			return timer;
		});
		this.earlyTimers.set(projectPath, early);
		const timer = setInterval(() => void sample(), DESCENDANT_SAMPLE_MS);
		timer.unref?.();
		this.timers.set(projectPath, timer);
	}

	/**
	 * Stops sampling and hands back the last tree seen while the app was alive.
	 * @param projectPath The launched project.
	 * @returns Its most recent descendants, or an empty list when none were ever seen.
	 */
	stop(projectPath: string): CapturedDescendant[] {
		const timer = this.timers.get(projectPath);
		if (timer) clearInterval(timer);
		this.timers.delete(projectPath);
		for (const early of this.earlyTimers.get(projectPath) ?? []) clearTimeout(early);
		this.earlyTimers.delete(projectPath);
		const descendants = this.samples.get(projectPath) ?? [];
		this.samples.delete(projectPath);
		return descendants;
	}
}
