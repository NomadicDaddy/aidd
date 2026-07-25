import type { AiCallSurface } from '../lib/aiCallLog.ts';
import type { BackendName } from '../plan/types.ts';
import type { AgentEvent, CLIBackend, PromptInput } from './types.ts';

import {
	type AgentClient,
	createDefaultNativeClient,
	loadNativeFileConfig,
	type ProviderName,
	SimulationAgentClient,
} from '../agent/client.ts';
import { runAgentLoop } from '../agent/loop.ts';

export interface NativeBackendOptions {
	/** Surface context for structured AI call logging. */
	callSurface?: AiCallSurface;
	client?: AgentClient;
	maxTurns?: number;
	name?: BackendName;
	providerOverride?: ProviderName;
}

export class NativeBackend implements CLIBackend {
	readonly name: BackendName;
	readonly idleDefaults = { killMs: 600_000, nudgeMs: 300_000 };
	private readonly options: NativeBackendOptions;

	constructor(options: NativeBackendOptions = {}) {
		this.options = options;
		this.name = options.name ?? 'native';
	}

	async *runPrompt(input: PromptInput, signal: AbortSignal): AsyncIterable<AgentEvent> {
		yield { backend: this.name, type: 'started' };
		const client =
			this.options.client ??
			(input.simulation ? new SimulationAgentClient() : undefined) ??
			(await createDefaultNativeClient(
				process.env,
				undefined,
				this.options.providerOverride,
				this.options.callSurface,
			));
		const fileConfig = await loadNativeFileConfig();
		const maxTurns = this.options.maxTurns ?? fileConfig.maxTurns;
		yield* runAgentLoop(input, {
			client,
			signal,
			simulation: input.simulation ?? process.env.AIDD_NATIVE_SIMULATION === '1',
			...(input.heuristicMode !== undefined ? { heuristicMode: input.heuristicMode } : {}),
			...(maxTurns !== undefined ? { maxTurns } : {}),
		});
	}
}
