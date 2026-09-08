import type { BlueprintSetupActivity } from 'aidd-shared/metadata/blueprint-setup';
import type { Feature } from 'aidd-shared/metadata/features';
import type { InitialPhase } from 'aidd-shared/metadata/onboarding';
import type { Roadmap } from 'aidd-shared/metadata/roadmap';
import type { LaunchTargetOverrides } from 'aidd-shared/plan/launch-target';

import {
	type BlueprintReadiness,
	type BlueprintReadinessOptions,
	evaluateBlueprintReadiness,
	readBlueprintSetupContext,
	readPersistedBlueprintReadiness,
	requirePersistedBlueprint,
} from 'aidd-shared/metadata/blueprint';
import { isTemplateRepo } from 'aidd-shared/metadata/template-ownership';

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

/**
 * The DTO for a readiness verdict. `activity` is the live work the verdict's wording came from, so
 * a client never has to infer "something must be running" from the state alone.
 *
 * @param readiness The readiness verdict to present.
 * @param activity The live run or pipeline the verdict describes, or null when none was found.
 * @returns The project-detail implementation contract for that verdict.
 */
function toImplementationState(
	readiness: BlueprintReadiness,
	activity: BlueprintSetupActivity | null,
): ProjectImplementationStateDto {
	return {
		activity,
		blueprintReady: readiness.ready,
		firstFeature: readiness.firstFeature
			? toImplementationFeature(readiness.firstFeature)
			: null,
		reason: readiness.reason,
		state: readiness.state === 'ready' ? 'blueprint_ready' : readiness.state,
	};
}

export function evaluateProjectImplementationState(
	phase: InitialPhase,
	features: Feature[],
	roadmap: Roadmap | undefined,
	options: BlueprintReadinessOptions = {},
): ProjectImplementationStateDto {
	return toImplementationState(
		evaluateBlueprintReadiness(phase, features, roadmap, options),
		options.setup?.activity ?? null,
	);
}

export async function evaluatePersistedProjectImplementationState(
	projectDir: string,
	phase: InitialPhase,
	features: Feature[],
	roadmap: Roadmap | undefined,
	activity: BlueprintSetupActivity | null = null,
): Promise<ProjectImplementationStateDto> {
	const templateRepo = await isTemplateRepo(projectDir);
	// Missing artifacts and live work only describe a project that has not reached coding; asking
	// for them at coding would read the filesystem to answer a question the verdict never poses.
	const setup =
		phase === 'coding' ? undefined : await readBlueprintSetupContext(projectDir, activity);
	const persisted = await requirePersistedBlueprint(
		projectDir,
		evaluateBlueprintReadiness(phase, features, roadmap, {
			templateRepo,
			...(setup ? { setup } : {}),
		}),
	);
	return toImplementationState(persisted, setup?.activity ?? null);
}

/**
 * Readiness read straight from disk, with no view of live execution. Used by the start-implementation
 * gate, which only asks whether the blueprint is ready — never what is running — so the reported
 * activity is null rather than a guess.
 *
 * @param projectDir The project to read.
 * @returns The implementation contract, with a null activity.
 */
export async function readProjectImplementationState(
	projectDir: string,
): Promise<ProjectImplementationStateDto> {
	return toImplementationState(await readPersistedBlueprintReadiness(projectDir), null);
}

export async function startProjectImplementation(
	projectDir: string,
	launchTarget: LaunchTargetOverrides,
	launchRun: (request: RunLaunchRequest) => Promise<{ id: string }>,
): Promise<ProjectStartImplementationResultDto> {
	const implementation = await readProjectImplementationState(projectDir);
	if (!implementation.blueprintReady || !implementation.firstFeature) {
		throw new HttpError(
			implementation.reason ?? 'This project is not ready to start implementation.',
			409,
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
