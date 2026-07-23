import type { SettingsCliStatusDto, SettingsSourceControlStatusDto } from '../../types.ts';
import type { StatusCommandRunner } from './status.ts';

import { getCliStatus, getSourceControlStatus } from './status.ts';

// Probing tool status spawns one subprocess per backend or provider (~13 in total) and
// waits on the slowest — seconds on Windows, where `az --version` alone routinely
// outruns the per-command timeout. The results only change when someone installs,
// removes, or upgrades a CLI, so re-probing on every page load was pure cost. Hold the
// first probe and reuse it until a caller explicitly asks for a refresh, which the
// Settings panels' existing Refresh buttons now do.
class StatusProbe<T> {
	private inflight: null | Promise<T> = null;
	private readonly load: () => Promise<T>;
	private value: null | T = null;

	constructor(load: () => Promise<T>) {
		this.load = load;
	}

	async get(refresh = false): Promise<T> {
		if (!refresh && this.value !== null) return this.value;
		// Concurrent callers — and repeated Refresh clicks — join the probe already in
		// flight instead of each spawning their own fleet of subprocesses.
		this.inflight ??= this.load()
			.then((result) => {
				this.value = result;
				return result;
			})
			.finally(() => {
				this.inflight = null;
			});
		return await this.inflight;
	}
}

export class SettingsStatusCache {
	private readonly cli: StatusProbe<SettingsCliStatusDto[]>;
	private readonly sourceControl: StatusProbe<SettingsSourceControlStatusDto[]>;

	constructor(runner?: StatusCommandRunner) {
		this.cli = new StatusProbe(async () => await getCliStatus(runner));
		this.sourceControl = new StatusProbe(
			async () => await getSourceControlStatus(runner ? { runner } : {})
		);
	}

	async cliStatus(refresh = false): Promise<SettingsCliStatusDto[]> {
		return await this.cli.get(refresh);
	}

	async sourceControlStatus(refresh = false): Promise<SettingsSourceControlStatusDto[]> {
		return await this.sourceControl.get(refresh);
	}

	// Fire both probes at boot so the first visit to Settings reads a warm cache instead
	// of waiting on the subprocess fleet. Failures are ignored: the next request simply
	// probes again, and a missing CLI is a normal result rather than an error.
	warm(): void {
		void this.cliStatus().catch(() => undefined);
		void this.sourceControlStatus().catch(() => undefined);
	}
}
