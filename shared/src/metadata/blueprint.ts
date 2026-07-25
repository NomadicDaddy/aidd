import { captureWriteGuardSnapshot } from '../pipeline/writeAllowlist.ts';
import { classifyFeatureStatusType, type Feature, selectNextFeature } from './features.ts';
import { detectInitialPhase, type InitialPhase } from './onboarding.ts';
import { evaluateRoadmapCodingGate, type Roadmap } from './roadmap.ts';
import { FileAiddStore } from './store.ts';

export type BlueprintReadinessState = 'blocked' | 'building' | 'complete' | 'preparing' | 'ready';

export interface BlueprintReadiness {
	firstFeature: Feature | null;
	ready: boolean;
	reason: null | string;
	state: BlueprintReadinessState;
}

function featureDirectory(feature: Feature): string {
	return feature.directory ?? feature.id;
}

export function evaluateBlueprintReadiness(
	phase: InitialPhase,
	features: Feature[],
	roadmap: Roadmap | undefined,
): BlueprintReadiness {
	if (phase !== 'coding') {
		return {
			firstFeature: null,
			ready: false,
			reason: 'Blueprint generation is still in progress.',
			state: 'preparing',
		};
	}

	const productFeatures = features.filter(
		(feature) => classifyFeatureStatusType(feature) === 'feature',
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
	const firstFeature = selectNextFeature(allowed, { allFeatures: productFeatures });
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

export async function readPersistedBlueprintReadiness(
	projectDir: string,
): Promise<BlueprintReadiness> {
	const store = new FileAiddStore(projectDir);
	const [phase, features] = await Promise.all([
		detectInitialPhase(projectDir),
		store.listFeatures({ includeAudit: true }),
	]);
	let roadmap: Roadmap | undefined;
	try {
		roadmap = await store.readRoadmap();
	} catch {
		roadmap = undefined;
	}
	return await requirePersistedBlueprint(
		projectDir,
		evaluateBlueprintReadiness(phase, features, roadmap),
	);
}
