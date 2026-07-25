import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

import { isObject, pathExists, pathIsDirectory, readJsonObject } from './fs-utils.ts';
import {
	type RoadmapApplyOptions,
	type RoadmapApplySummary,
	type RoadmapChangePlan,
	type RoadmapFeaturePlan,
	type RoadmapMilestoneSummary,
} from './types.ts';

function objectProperty(value: Record<string, unknown>, key: string): Record<string, unknown> {
	const property = value[key];
	if (!isObject(property)) throw new Error(`roadmap.json is missing object property '${key}'`);
	return property;
}

function readDependencyNames(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
}

function roadmapTimestamp(now: Date): string {
	return now.toISOString().replace(/\.\d{3}Z$/, '.000Z');
}

function dependenciesMatch(current: unknown, expected: string[]): boolean {
	if (!Array.isArray(current)) return false;
	if (current.length !== expected.length) return false;
	return expected.every((dependency) => current.includes(dependency));
}

async function buildFeatureIdLookup(featuresDir: string): Promise<Map<string, string>> {
	const lookup = new Map<string, string>();
	const entries = await readdir(featuresDir, { withFileTypes: true });
	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		const featurePath = join(featuresDir, entry.name, 'feature.json');
		if (!(await pathExists(featurePath))) continue;
		const featureJson = await readJsonObject(featurePath);
		if (typeof featureJson.id === 'string') lookup.set(entry.name, featureJson.id);
	}
	return lookup;
}

function buildMilestoneSummaries(
	milestones: Record<string, unknown>,
	roadmapFeatures: Record<string, unknown>,
): RoadmapMilestoneSummary[] {
	return Object.entries(milestones).map(([milestone, rawEntry]) => {
		const entry = isObject(rawEntry) ? rawEntry : {};
		const priority = typeof entry.priority === 'number' ? entry.priority : 0;
		const count = Object.values(roadmapFeatures).filter(
			(featureEntry) => isObject(featureEntry) && featureEntry.milestone === milestone,
		).length;
		return {
			count,
			...(typeof entry.description === 'string' ? { description: entry.description } : {}),
			milestone,
			priority,
		};
	});
}

function computeRoadmapChange(plan: RoadmapFeaturePlan): RoadmapChangePlan {
	const priorityMatches = Number(plan.feature.priority) === plan.priority;
	const depsMatch = dependenciesMatch(plan.feature.dependencies, plan.dependencies);
	return {
		...plan,
		changed: !priorityMatches || !depsMatch,
	};
}

export async function applyRoadmap(
	projectDir: string,
	options: RoadmapApplyOptions = {},
): Promise<RoadmapApplySummary> {
	const resolvedProjectDir = resolve(projectDir);
	const roadmapFile = join(resolvedProjectDir, '.aidd', 'roadmap.json');
	const featuresDir = join(resolvedProjectDir, '.aidd', 'features');

	if (!(await pathExists(roadmapFile)))
		throw new Error(`roadmap.json not found at: ${roadmapFile}`);
	if (!(await pathIsDirectory(featuresDir))) {
		throw new Error(`features directory not found at: ${featuresDir}`);
	}

	const roadmap = await readJsonObject(roadmapFile);
	const milestones = objectProperty(roadmap, 'milestones');
	const roadmapFeatures = objectProperty(roadmap, 'features');
	const milestoneNames = Object.keys(milestones);
	for (const milestone of milestoneNames) {
		const entry = milestones[milestone];
		if (!isObject(entry) || typeof entry.priority !== 'number') {
			throw new Error(`Milestone '${milestone}' is missing a priority value`);
		}
	}

	const lookup = await buildFeatureIdLookup(featuresDir);
	const errors: string[] = [];
	const warnings: string[] = [];
	const plans: RoadmapFeaturePlan[] = [];

	for (const [dirName, rawConfig] of Object.entries(roadmapFeatures)) {
		const config = isObject(rawConfig) ? rawConfig : {};
		const milestone = typeof config.milestone === 'string' ? config.milestone : '';
		const milestoneConfig = milestones[milestone];
		if (!isObject(milestoneConfig)) {
			errors.push(`Feature '${dirName}': unknown milestone '${milestone}'`);
			continue;
		}

		const filePath = join(featuresDir, dirName, 'feature.json');
		if (!(await pathExists(filePath))) {
			errors.push(`Feature '${dirName}': directory not found`);
			continue;
		}

		const feature = await readJsonObject(filePath);
		const dependencies: string[] = [];
		for (const dependencyName of readDependencyNames(config.dependencies)) {
			const dependencyId = lookup.get(dependencyName);
			if (dependencyId === undefined) {
				warnings.push(
					`Dependency '${dependencyName}' has no matching feature directory; skipping`,
				);
				continue;
			}
			dependencies.push(dependencyId);
		}
		plans.push({
			dependencies,
			dirName,
			feature,
			filePath,
			priority: milestoneConfig.priority as number,
		});
	}

	if (errors.length > 0) {
		return {
			appName: basename(resolvedProjectDir),
			dryRun: options.dryRun === true,
			errors,
			milestones: buildMilestoneSummaries(milestones, roadmapFeatures),
			missing: errors.filter((error) => error.includes('directory not found')).length,
			projectDir: resolvedProjectDir,
			skipped: 0,
			total: Object.keys(roadmapFeatures).length,
			updated: 0,
			warnings,
		};
	}

	const changes = plans.map(computeRoadmapChange);
	const changed = changes.filter((plan) => plan.changed);
	const dryRun = options.dryRun === true;
	if (!dryRun) {
		const updatedAt = roadmapTimestamp(options.now ?? new Date());
		for (const plan of changed) {
			const nextFeature = {
				...plan.feature,
				dependencies: plan.dependencies,
				priority: plan.priority,
				updatedAt,
			};
			await mkdir(join(featuresDir, plan.dirName), { recursive: true });
			await writeFile(plan.filePath, `${JSON.stringify(nextFeature, null, '\t')}\n`);
		}
	}

	return {
		appName: basename(resolvedProjectDir),
		dryRun,
		errors,
		milestones: buildMilestoneSummaries(milestones, roadmapFeatures),
		missing: 0,
		projectDir: resolvedProjectDir,
		skipped: changes.length - changed.length,
		total: Object.keys(roadmapFeatures).length,
		updated: changed.length,
		warnings,
	};
}
