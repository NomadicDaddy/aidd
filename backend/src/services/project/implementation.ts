import type { Feature } from 'aidd-shared/metadata/features';
import type { InitialPhase } from 'aidd-shared/metadata/onboarding';
import type { Roadmap } from 'aidd-shared/metadata/roadmap';
import type { LaunchTargetOverrides } from 'aidd-shared/plan/launch-target';

import {
	evaluateBlueprintReadiness,
	readPersistedBlueprintReadiness,
	requirePersistedBlueprint,
} from 'aidd-shared/metadata/blueprint';

import type {
	ProjectImplementationFeatureDto,
	ProjectImplementationStateDto,
	ProjectStartImplementationResultDto,
	RunLaunchRequest,
} from '../../types.ts';

import { HttpError } from '../errors.ts';

function featureDirectory(feature: Feature): string {
	return feature.directory ?? feature.id;
}

function toImplementationFeature(feature: Feature): ProjectImplementationFeatureDto {
	return {
		directory: featureDirectory(feature),
		id: feature.id,
		title: feature.title ?? feature.description ?? feature.id,
	};
}

export function evaluateProjectImplementationState(
	phase: InitialPhase,
	features: Feature[],
	roadmap: Roadmap | undefined
): ProjectImplementationStateDto {
	const readiness = evaluateBlueprintReadiness(phase, features, roadmap);
	return {
		blueprintReady: readiness.ready,
		firstFeature: readiness.firstFeature
			? toImplementationFeature(readiness.firstFeature)
			: null,
		reason: readiness.reason,
		state: readiness.state === 'ready' ? 'blueprint_ready' : readiness.state,
	};
}

export async function evaluatePersistedProjectImplementationState(
	projectDir: string,
	phase: InitialPhase,
	features: Feature[],
	roadmap: Roadmap | undefined
): Promise<ProjectImplementationStateDto> {
	const persisted = await requirePersistedBlueprint(
		projectDir,
		evaluateBlueprintReadiness(phase, features, roadmap)
	);
	return {
		blueprintReady: persisted.ready,
		firstFeature: persisted.firstFeature
			? toImplementationFeature(persisted.firstFeature)
			: null,
		reason: persisted.reason,
		state: persisted.state === 'ready' ? 'blueprint_ready' : persisted.state,
	};
}

export async function readProjectImplementationState(
	projectDir: string
): Promise<ProjectImplementationStateDto> {
	const readiness = await readPersistedBlueprintReadiness(projectDir);
	return {
		blueprintReady: readiness.ready,
		firstFeature: readiness.firstFeature
			? toImplementationFeature(readiness.firstFeature)
			: null,
		reason: readiness.reason,
		state: readiness.state === 'ready' ? 'blueprint_ready' : readiness.state,
	};
}

export async function startProjectImplementation(
	projectDir: string,
	launchTarget: LaunchTargetOverrides,
	launchRun: (request: RunLaunchRequest) => Promise<{ id: string }>
): Promise<ProjectStartImplementationResultDto> {
	const implementation = await readProjectImplementationState(projectDir);
	if (!implementation.blueprintReady || !implementation.firstFeature) {
		throw new HttpError(
			implementation.reason ?? 'This project is not ready to start implementation.',
			409
		);
	}
	const request: RunLaunchRequest = {
		feature: implementation.firstFeature.directory,
		mode: 'coding',
		projectDir,
	};
	if (launchTarget.backend !== undefined) request.backend = launchTarget.backend;
	if (launchTarget.model !== undefined) request.model = launchTarget.model;
	if (launchTarget.reasoningEffort !== undefined) {
		request.reasoningEffort = launchTarget.reasoningEffort;
	}
	const run = await launchRun(request);
	return { feature: implementation.firstFeature, runId: run.id };
}
