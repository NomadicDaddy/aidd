import type { AgentEvent } from 'aidd-shared/backends/types';
import type { BackendName } from 'aidd-shared/plan/types';

import { setTimeout as sleep } from 'node:timers/promises';

const CODEX_COMPLETION_USAGE_DRAIN_MS = 5_000;

// Codex emits authoritative turn usage after the final assistant message. Once a completed
// feature's commit is visible, briefly drain that trailing event before aborting the backend.
export class CompletionUsageDrain {
	private deadlineMs?: number;
	private usageCaptured = false;

	async afterCommit(
		backend: BackendName,
		committed: boolean,
		nextEvent: Promise<IteratorResult<AgentEvent>>,
	): Promise<IteratorResult<AgentEvent> | undefined> {
		if (backend !== 'codex' || !committed || this.usageCaptured) return undefined;

		this.deadlineMs ??= Date.now() + CODEX_COMPLETION_USAGE_DRAIN_MS;
		const remainingMs = this.deadlineMs - Date.now();
		if (remainingMs <= 0) return undefined;

		return await Promise.race([nextEvent, sleep(remainingMs, undefined)]);
	}

	record(event: AgentEvent): void {
		if (event.type === 'usage' && this.deadlineMs !== undefined) this.usageCaptured = true;
	}
}
