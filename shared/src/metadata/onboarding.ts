import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { classifyFeatureStatusType } from './features/query.ts';
import { type Feature } from './features/types.ts';
import { METADATA_DIR, metadataPath } from './paths.ts';

export type InitialPhase = 'coding' | 'initializer' | 'onboarding';

const codebaseIgnoreNames = new Set([
	'.DS_Store',
	'.git',
	'.idea',
	'.vscode',
	METADATA_DIR,
	'node_modules',
]);

async function pathExists(path: string): Promise<boolean> {
	try {
		await stat(path);
		return true;
	} catch {
		return false;
	}
}

// An onboarded backlog contains at least one real product feature (not just audit findings or
// remediation items). The ingest lane's project-intake pipeline files remediation/audit features
// plus a CHANGELOG, which alone would satisfy a naive "any feature.json" check and trick the first
// coding run into skipping onboarding — leaving spec.md orphaned. Requiring a real backlog feature
// keeps that case in the onboarding phase (which turns spec.md into features) exactly once: after
// onboarding files real features, this returns true and subsequent runs proceed to coding.
async function hasRealBacklogFeature(featuresDir: string): Promise<boolean> {
	try {
		const entries = await readdir(featuresDir, { withFileTypes: true });
		for (const entry of entries) {
			if (!entry.isDirectory()) continue;
			const featurePath = join(featuresDir, entry.name, 'feature.json');
			let parsed: Record<string, unknown>;
			try {
				parsed = JSON.parse(await readFile(featurePath, 'utf8')) as Record<string, unknown>;
			} catch {
				continue;
			}
			const feature = { id: entry.name, ...parsed, directory: entry.name } as Feature;
			if (classifyFeatureStatusType(feature) === 'feature') return true;
		}
		return false;
	} catch {
		return false;
	}
}

async function isOnboardingComplete(metadataDir: string): Promise<boolean> {
	const featuresDir = join(metadataDir, 'features');
	const specPath = join(metadataDir, 'spec.md');
	const changelogPath = join(metadataDir, 'CHANGELOG.md');
	if (!(await pathExists(featuresDir))) return false;
	if (!(await pathExists(specPath))) return false;
	if (!(await pathExists(changelogPath))) return false;
	if (!(await hasRealBacklogFeature(featuresDir))) return false;
	return true;
}

async function isExistingCodebase(projectDir: string): Promise<boolean> {
	try {
		const entries = await readdir(projectDir);
		return entries.some((name) => !codebaseIgnoreNames.has(name));
	} catch {
		return false;
	}
}

export async function detectInitialPhase(projectDir: string): Promise<InitialPhase> {
	const metadataDir = metadataPath(projectDir);
	if (await isOnboardingComplete(metadataDir)) return 'coding';
	if (await isExistingCodebase(projectDir)) return 'onboarding';
	return 'initializer';
}
