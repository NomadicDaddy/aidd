import type { ResolvedConfig } from 'aidd-shared/config';
import type { RestSubstitution } from 'aidd-shared/provider-rest/decide';

import {
	type EffectiveLaunchTarget,
	resolveRestedLaunchTarget,
} from 'aidd-shared/plan/launch-target';
import { type AiddMode, normalizeBackendName } from 'aidd-shared/plan/types';
import { readProviderRests } from 'aidd-shared/provider-rest/store';

import type { RunLaunchRequest } from '../../types.ts';
import type { LaunchRunOptions } from './launch.ts';

import { ProviderRestingError } from '../errors.ts';

export interface LaunchRestResult {
	substitution?: RestSubstitution;
	target: EffectiveLaunchTarget;
}

/**
 * Provider rest for one web launch, through the same resolver the CLI uses. A refusal throws
 * ProviderRestingError, whose details let the launch surface offer the alternative and "run
 * anyway"; a substitution comes back so the launch can record it on the row.
 *
 * @param config The launch's resolved config, project overlay included.
 * @param dataDir aidd's data directory, where the rests live.
 * @param mode The run mode, for mode-scoped model resolution.
 * @param input The launch request; its backend, model, effort and ignoreRest are read.
 * @param backendChoice Whether a person picked the request's backend for this run.
 * @returns The target to launch on, and the substitution when rest moved it.
 */
export async function resolveLaunchRest(
	config: ResolvedConfig,
	dataDir: string,
	mode: AiddMode,
	input: RunLaunchRequest,
	backendChoice: NonNullable<LaunchRunOptions['backendChoice']>,
): Promise<LaunchRestResult> {
	const now = new Date();
	const rested = resolveRestedLaunchTarget(
		config,
		mode,
		{
			backend: input.backend ? normalizeBackendName(input.backend) : undefined,
			model: input.model,
			reasoningEffort: input.reasoningEffort,
		},
		{
			ignoreRest: input.ignoreRest === true,
			now,
			personPicked: backendChoice === 'person',
			rests: await readProviderRests(dataDir, now),
		},
	);
	if (rested.kind === 'refuse') {
		const { refusal } = rested;
		throw new ProviderRestingError(refusal.message, {
			alternative: refusal.alternative ?? null,
			backend: refusal.rest.backend,
			code: 'provider_resting',
			reason: refusal.rest.reason,
			until: refusal.rest.until,
		});
	}
	if (rested.substitution === undefined) return { target: rested.target };
	return { substitution: rested.substitution, target: rested.target };
}

/**
 * The request a substituted launch builds its command from. The backend, model and effort it
 * carried were chosen for the backend that is resting, so they are dropped and the command takes
 * the substitute's resolved values instead.
 *
 * @param input The launch request as received.
 * @param substituted Whether provider rest moved this launch to a substitute.
 * @returns The request to build the command from.
 */
export function withoutLaunchTarget(
	input: RunLaunchRequest,
	substituted: boolean,
): RunLaunchRequest {
	if (!substituted) return input;
	const request = { ...input };
	delete request.backend;
	delete request.model;
	delete request.reasoningEffort;
	return request;
}
