import type { AgentEvent } from 'aidd-shared/backends/types';
import type { RunPlan } from 'aidd-shared/plan/types';

import { scrubSecrets, StreamingSecretScrubber } from 'aidd-shared/lib/secretScrubber';
import { type FileHandle, open } from 'node:fs/promises';

import { nonNativeRunLogIntro } from './active-run-heartbeat-support.ts';
import { NativeRunLogRenderer } from './native-run-log.ts';

/** Serializes and redacts the durable console transcript written beside an active Run. */
export class ActiveRunLog {
	private readonly backend: RunPlan['backend'];
	private handle: FileHandle | null;
	private readonly logScrubber = new StreamingSecretScrubber();
	private readonly nativeLogRenderer = new NativeRunLogRenderer();
	private writeChain: Promise<void> = Promise.resolve();

	private constructor(backend: RunPlan['backend'], handle: FileHandle | null) {
		this.backend = backend;
		this.handle = handle;
	}

	static async open(plan: RunPlan, logPath: null | string | undefined): Promise<ActiveRunLog> {
		let handle: FileHandle | null = null;
		if (logPath) {
			try {
				handle = await open(logPath, 'a');
				if (plan.backend !== 'native') {
					await handle.write(scrubSecrets(nonNativeRunLogIntro(plan)));
				}
			} catch {
				// Log file creation must not prevent the CLI run from starting.
			}
		}
		return new ActiveRunLog(plan.backend, handle);
	}

	write(event: AgentEvent): void {
		if (!this.handle) return;
		const line = this.lineFor(event);
		if (line === null) return;
		// Streamed fragments flow through the stateful scrubber, which withholds a suffix a secret
		// could still be forming in. Complete lines first flush that tail to preserve ordering.
		const streamed = event.type === 'assistant_delta' || event.type === 'raw_log';
		const scrubbed = streamed
			? this.logScrubber.write(line)
			: this.logScrubber.flush() + scrubSecrets(line);
		if (scrubbed.length > 0) this.enqueue(scrubbed);
	}

	async close(): Promise<void> {
		const tail = this.logScrubber.flush();
		if (tail.length > 0) this.enqueue(tail);
		await this.writeChain;
		await this.handle?.close().catch(() => {});
		this.handle = null;
	}

	private enqueue(text: string): void {
		const handle = this.handle;
		if (!handle) return;
		this.writeChain = this.writeChain.then(
			() => handle.write(text).then(() => undefined),
			() => undefined,
		);
	}

	private lineFor(event: AgentEvent): null | string {
		if (event.type === 'raw_log') return event.chunk;
		// Process CLIs already stream their transcript as raw_log; rendering their structured
		// events would double-log. Native emits structured events only, so render those here.
		if (this.backend !== 'native') return null;
		return this.nativeLogRenderer.render(event);
	}
}
