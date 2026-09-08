import { captureWriteGuardSnapshot } from '../pipeline/writeAllowlist.ts';
import {
	type BlueprintSetupActivity,
	type BlueprintSetupContext,
	describeBlueprintSetup,
} from './blueprint-setup.ts';
import { classifyFeatureStatusType, type Feature, selectNextFeature } from './features.ts';
import {
	detectInitialPhase,
	type InitialPhase,
	listMissingOnboardingArtifacts,
} from './onboarding.ts';
import { evaluateRoadmapCodingGate, type Roadmap } from './roadmap.ts';
import { FileAiddStore } from './store.ts';
import { isTemplateOwnedFeature, isTemplateRepo } from './template-ownership.ts';

export type BlueprintReadinessState =
	'blocked' | 'building' | 'complete' | 'preparing' | 'queued' | 'ready' | 'setup_incomplete';

export interface BlueprintReadiness {
	firstFeature: Feature | null;
	ready: boolean;
	reason: null | string;
	state: BlueprintReadinessState;
}

export interface BlueprintReadinessOptions {
	/**
	 * What is on disk and what is executing for a project that has not reached the coding phase.
	 * Omitted by callers with no view of live execution state, which reads as "nothing is running":
	 * the verdict then describes an idle project rather than claiming work is in flight.
	 */
	setup?: BlueprintSetupContext;
	/**
	 * Whether `features` were read from the Spernakit template repository itself. There, records
	 * stamped with `spernakit_version` are the product; anywhere else they are the scaffolded shell
	 * and are excluded from the readiness verdict (see `isTemplateOwnedFeature`).
	 */
	templateRepo?: boolean;
}

function featureDirectory(feature: Feature): string {
	return feature.directory ?? feature.id;
}

export function evaluateBlueprintReadiness(
	phase: InitialPhase,
	features: Feature[],
	roadmap: Roadmap | undefined,
	options: BlueprintReadinessOptions = {},
): BlueprintReadiness {
	if (phase !== 'coding') {
		// Readiness cannot speak to activity: what is missing on disk says nothing about whether
		// anything is working on it. The caller supplies the live execution state it can see.
		const verdict = describeBlueprintSetup(options.setup);
		return {
			firstFeature: null,
			ready: false,
			reason: verdict.reason,
			state: verdict.state,
		};
	}

	// A template-mode scaffold seeds its own completed records alongside the blueprint's. They are
	// the shell the blueprint builds on, not work it asked for: counting them as product features
	// reads every such scaffold as `building` (some records pass) and the blueprint is never ready,
	// so a stop-before-implementation run iterates to its cap without ever being able to stop.
	const templateRepo = options.templateRepo ?? false;
	const productFeatures = features.filter(
		(feature) =>
			classifyFeatureStatusType(feature) === 'feature' &&
			!isTemplateOwnedFeature(feature, templateRepo),
	);
	if (productFeatures.length === 0) {
		return {
			firstFeature: null,
			ready: false,
			reason: 'No product features are available to implement.',
			state: 'blocked',
		};
	}
	if (productFeatures.every((feature) => feature.passes === true)) {
		return { firstFeature: null, ready: false, reason: null, state: 'complete' };
	}
	if (
		productFeatures.some(
			(feature) => feature.passes === true || feature.status === 'in_progress',
		)
	) {
		return { firstFeature: null, ready: false, reason: null, state: 'building' };
	}
	if (!roadmap || !roadmap.milestones.MVP) {
		return {
			firstFeature: null,
			ready: false,
			reason: 'roadmap.json must define an MVP milestone.',
			state: 'blocked',
		};
	}

	const gate = evaluateRoadmapCodingGate(roadmap, productFeatures);
	if (gate.blocked || gate.activeMilestone !== 'MVP') {
		return {
			firstFeature: null,
			ready: false,
			reason: gate.blocked
				? 'Every product feature must map to a valid roadmap milestone.'
				: 'MVP must be the first incomplete roadmap milestone.',
			state: 'blocked',
		};
	}

	for (const feature of productFeatures) {
		const milestone = roadmap.features[featureDirectory(feature)]?.milestone;
		const expectedStatus = milestone === 'MVP' ? 'backlog' : 'waiting_approval';
		if (feature.passes !== false || feature.status !== expectedStatus) {
			return {
				firstFeature: null,
				ready: false,
				reason: 'MVP features must be backlog, post-MVP features waiting approval, and all features non-passing.',
				state: 'blocked',
			};
		}
	}

	const allowed = productFeatures.filter((feature) =>
		gate.allowedFeatureDirectories.includes(featureDirectory(feature)),
	);
	// Dependencies resolve against the whole inventory: a product feature's first step is allowed to
	// build on a template record (or any other completed record) that the product filter excluded.
	const firstFeature = selectNextFeature(allowed, { allFeatures: features });
	if (!firstFeature) {
		return {
			firstFeature: null,
			ready: false,
			reason: 'No dependency-ready MVP feature is available.',
			state: 'blocked',
		};
	}

	return { firstFeature, ready: true, reason: null, state: 'ready' };
}

export async function requirePersistedBlueprint(
	projectDir: string,
	readiness: BlueprintReadiness,
): Promise<BlueprintReadiness> {
	if (!readiness.ready) return readiness;
	const git = await captureWriteGuardSnapshot(projectDir);
	if (!git || git.head === undefined || git.entries.size > 0) {
		return {
			firstFeature: readiness.firstFeature,
			ready: false,
			reason: 'The blueprint must be persisted on disk with an initialized, clean source tree before implementation.',
			state: 'blocked',
		};
	}
	return readiness;
}

/**
 * The setup context for a project on disk. `activity` is whatever live work the caller found for
 * this exact project; callers with no view of execution state pass nothing and get the idle reading.
 */
export async function readBlueprintSetupContext(
	projectDir: string,
	activity: BlueprintSetupActivity | null = null,
): Promise<BlueprintSetupContext> {
	return { activity, missingArtifacts: await listMissingOnboardingArtifacts(projectDir) };
}

export async function readPersistedBlueprintReadiness(
	projectDir: string,
	activity: BlueprintSetupActivity | null = null,
): Promise<BlueprintReadiness> {
	const store = new FileAiddStore(projectDir);
	const [phase, features, templateRepo] = await Promise.all([
		detectInitialPhase(projectDir),
		store.listFeatures({ includeAudit: true }),
		isTemplateRepo(projectDir),
	]);
	let roadmap: Roadmap | undefined;
	try {
		roadmap = await store.readRoadmap();
	} catch {
		roadmap = undefined;
	}
	const setup =
		phase === 'coding' ? undefined : await readBlueprintSetupContext(projectDir, activity);
	return await requirePersistedBlueprint(
		projectDir,
		evaluateBlueprintReadiness(phase, features, roadmap, {
			templateRepo,
			...(setup ? { setup } : {}),
		}),
	);
}
