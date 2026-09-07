import type { ResolvedWebConfig } from 'aidd-shared/config';
import type { RunInitiator } from 'aidd-shared/metadata/active-runs';

import type { WebDatabase } from '../../db/client.ts';
import type { RunContinuationReason, RunLaunchRequest } from '../../types.ts';
import type { TelemetryService } from '../telemetryService.ts';
import type { WebRunRow } from './queryContracts.ts';

import { type ContinuationLaunchDeps, continueRun, maybeAutoChainRun } from './continuation.ts';

// Bundles the two continuation consumers (manual Continue route, opt-in auto-chain hook) around
// one shared deps builder, so RunService only wires thunks. Thunks — not captured values —
// because this is created as a class-field initializer, before the service constructor body has
// assigned db/telemetry/config, and because config is hot-swapped by updateConfig at runtime.
// Declared as function-valued properties rather than methods: every one of these is a standalone
// closure that never reads `this`, and method shorthand would both invite unbound-method warnings
// at each call site that forwards one and type the parameters bivariantly.
export interface RunContinuationWiring {
	continueRun: (id: string) => Promise<WebRunRow>;
	/** Fire-and-forget heartbeat hook; all gating lives in maybeAutoChainRun (never throws). */
	onRunContinuation: (runId: string, reason: RunContinuationReason) => void;
}

export function createRunContinuationWiring(input: {
	db: () => WebDatabase;
	launch: (request: RunLaunchRequest, initiator: RunInitiator) => Promise<WebRunRow>;
	telemetry: () => TelemetryService;
	webConfig: () => Pick<ResolvedWebConfig, 'autoChainLimit' | 'autoChainRuns'>;
}): RunContinuationWiring {
	const deps = (): ContinuationLaunchDeps => ({
		db: input.db(),
		launch: input.launch,
		// Mirrors the direct-launch route's telemetry start so follow-up runs appear on the
		// telemetry dashboard like any other web-launched run.
		recordStart: async (run) => {
			await input.telemetry().recordStart({
				backend: run.backend,
				model: run.model,
				projectName: run.projectName,
				projectPath: run.projectPath,
				resourceId: run.id,
				resourceName: `${run.mode} · ${run.projectName}`,
				resourceType: 'run',
				runId: run.id,
				source: 'web',
				startedAt: run.startedAt,
			});
		},
	});
	return {
		continueRun: (id) => continueRun(deps(), id),
		onRunContinuation: (runId, reason) => {
			const web = input.webConfig();
			void maybeAutoChainRun(
				{
					...deps(),
					autoChainLimit: web.autoChainLimit,
					autoChainRuns: web.autoChainRuns,
				},
				runId,
				reason,
			);
		},
	};
}
