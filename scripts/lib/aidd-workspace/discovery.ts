import { readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { pathExists, pathIsDirectory, readJsonObject } from './fs-utils.ts';
import {
	type DiscoveredProject,
	type FeatureStatusEntry,
	type FeatureStatusOptions,
	type FeatureStatusSummaryEntry,
	type FeatureStatusType,
	featureStatusTypes,
	type ProjectDiscoveryOptions,
} from './types.ts';

function shouldSkipProjectDirectory(name: string): boolean {
	return name === 'logs' || name.endsWith('.old');
}

function normalizeNameList(names: string[] | undefined): string[] | undefined {
	if (names === undefined) return undefined;
	const normalized = names.map((name) => name.trim()).filter(Boolean);
	return normalized.length === 0 ? undefined : [...new Set(normalized)].sort();
}

export async function discoverAiddProjects(
	options: ProjectDiscoveryOptions,
): Promise<DiscoveredProject[]> {
	const applicationsRoot = resolve(options.applicationsRoot);
	const selectedApplications = normalizeNameList(options.applications);
	const requireFeaturesDir = options.requireFeaturesDir ?? false;
	const projects: DiscoveredProject[] = [];

	if (selectedApplications !== undefined) {
		for (const name of selectedApplications) {
			const projectDir = resolve(applicationsRoot, name);
			const marker = join(projectDir, '.aidd');
			const required = requireFeaturesDir ? join(marker, 'features') : marker;
			if (await pathIsDirectory(required)) projects.push({ name, projectDir });
		}
		return projects.sort((left, right) => left.name.localeCompare(right.name));
	}

	const entries = await readdir(applicationsRoot, { withFileTypes: true });
	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		if (shouldSkipProjectDirectory(entry.name)) continue;
		const projectDir = join(applicationsRoot, entry.name);
		const marker = join(projectDir, '.aidd');
		const required = requireFeaturesDir ? join(marker, 'features') : marker;
		if (await pathIsDirectory(required)) projects.push({ name: entry.name, projectDir });
	}

	return projects.sort((left, right) => left.name.localeCompare(right.name));
}

function classifyFeature(featureDirectory: string): FeatureStatusType {
	if (/^audit-[a-z0-9]+(?:-[a-z0-9]+)*?-\d{6,}-/.test(featureDirectory)) {
		return 'audit';
	}
	if (/^remediation(-\d{8,14})?-.+/.test(featureDirectory)) return 'remediation';
	return 'feature';
}

function featureIsCompleted(
	type: FeatureStatusType,
	featureJson: Record<string, unknown>,
): boolean {
	if (type === 'audit') {
		return featureJson.status === 'completed' && featureJson.passes === true;
	}
	return featureJson.status === 'completed';
}

export async function collectFeatureStatus(
	options: FeatureStatusOptions,
): Promise<FeatureStatusEntry[]> {
	const types = new Set(options.types ?? featureStatusTypes);
	const projects = await discoverAiddProjects({
		...(options.applications !== undefined ? { applications: options.applications } : {}),
		applicationsRoot: options.applicationsRoot,
		requireFeaturesDir: true,
	});
	const entries: FeatureStatusEntry[] = [];

	for (const project of projects) {
		const featuresDir = join(project.projectDir, '.aidd', 'features');
		const featureDirs = await readdir(featuresDir, { withFileTypes: true });
		for (const featureDir of featureDirs) {
			if (!featureDir.isDirectory()) continue;
			const featureJsonPath = join(featuresDir, featureDir.name, 'feature.json');
			if (!(await pathExists(featureJsonPath))) continue;
			let featureJson: Record<string, unknown>;
			try {
				featureJson = await readJsonObject(featureJsonPath);
			} catch {
				continue;
			}
			const type = classifyFeature(featureDir.name);
			if (!types.has(type)) continue;
			const completed = featureIsCompleted(type, featureJson);
			if (options.state === 'completed' && !completed) continue;
			if (options.state === 'pending' && completed) continue;
			entries.push({
				application: project.name,
				completed,
				path: featureJsonPath,
				type,
			});
		}
	}

	return entries.sort((left, right) => left.path.localeCompare(right.path));
}

export function summarizeFeatureStatus(entries: FeatureStatusEntry[]): FeatureStatusSummaryEntry[] {
	const byApplication = new Map<string, FeatureStatusSummaryEntry>();
	for (const entry of entries) {
		const summary = byApplication.get(entry.application) ?? {
			application: entry.application,
			audit: 0,
			completed: 0,
			feature: 0,
			pending: 0,
			remediation: 0,
			total: 0,
		};
		summary[entry.type]++;
		if (entry.completed) summary.completed++;
		else summary.pending++;
		summary.total++;
		byApplication.set(entry.application, summary);
	}
	return [...byApplication.values()].sort((left, right) =>
		left.application.localeCompare(right.application),
	);
}
