import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

import {
	isAuditApplicableToProfile as resolverIsAuditApplicableToProfile,
	isLowExposureLocalProfile,
	normalizeProjectAssuranceProfileFile,
	normalizeProjectAssuranceProfileInput,
	requiresFullHardening,
	type ProjectAssuranceProfile,
	type ProjectAssuranceProfileInput,
} from '../index.ts';
import { loadAuditProfileMapping, loadAuditProfileOverrides } from './audit-profile-mapping.ts';
import { metadataPath } from './paths.ts';
import { detectProjectStack } from './project-stack.ts';

const projectProfileFileName = 'project-profile.json';

export { isLowExposureLocalProfile, requiresFullHardening };

interface InferenceSignals {
	hasConvex: boolean;
	isArchive: boolean;
	stackFamily: string;
}

export function projectProfilePath(projectDir: string): string {
	return join(metadataPath(projectDir), projectProfileFileName);
}

export async function readProjectAssuranceProfile(
	projectDir: string
): Promise<ProjectAssuranceProfile> {
	const explicit = await readExplicitProjectAssuranceProfile(projectDir);
	if (explicit) return explicit;
	return await inferProjectAssuranceProfile(projectDir);
}

export async function writeProjectAssuranceProfile(
	projectDir: string,
	input: ProjectAssuranceProfileInput
): Promise<ProjectAssuranceProfile> {
	const profile = normalizeProjectAssuranceProfileInput(input, new Date().toISOString());
	await mkdir(metadataPath(projectDir), { recursive: true });
	await writeFile(projectProfilePath(projectDir), `${JSON.stringify(profile, null, 2)}\n`);
	return profile;
}

export async function filterApplicableAuditNames(
	catalogDir: string,
	projectDir: string,
	auditNames: string[]
): Promise<string[]> {
	const profile = await readProjectAssuranceProfile(projectDir);
	const mapping = await loadAuditProfileMapping(catalogDir);
	const overrides = await loadAuditProfileOverrides(projectDir);
	return auditNames.filter((auditName) =>
		resolverIsAuditApplicableToProfile(profile, auditName, mapping, overrides)
	);
}

export async function readExplicitProjectAssuranceProfile(
	projectDir: string
): Promise<null | ProjectAssuranceProfile> {
	let raw: unknown;
	try {
		raw = JSON.parse(await readFile(projectProfilePath(projectDir), 'utf8')) as unknown;
	} catch {
		return null;
	}
	try {
		return normalizeProjectAssuranceProfileFile(raw);
	} catch {
		return null;
	}
}

export async function inferProjectAssuranceProfile(
	projectDir: string
): Promise<ProjectAssuranceProfile> {
	const signals = await gatherInferenceSignals(projectDir);
	const updatedAt = new Date().toISOString();
	if (signals.isArchive) {
		return {
			authMode: 'none',
			bucket: 'prototype_archive',
			criticality: 'toy',
			dataSensitivity: 'none',
			deployment: 'local',
			externalIntegrations: 'none',
			source: 'inferred',
			updatedAt,
		};
	}
	if (signals.hasConvex || signals.stackFamily === 'react-convex') {
		return {
			authMode: 'login',
			bucket: 'internet_single_org',
			criticality: 'operational',
			dataSensitivity: 'personal',
			deployment: 'cloud',
			externalIntegrations: 'write_capable',
			source: 'inferred',
			updatedAt,
		};
	}
	if (signals.stackFamily === 'spernakit') {
		return {
			authMode: 'rbac',
			bucket: 'multi_user_local',
			criticality: 'utility',
			dataSensitivity: 'personal',
			deployment: 'local',
			externalIntegrations: 'none',
			source: 'inferred',
			updatedAt,
		};
	}
	return {
		authMode: 'local_owner',
		bucket: 'single_user_local',
		criticality: 'utility',
		dataSensitivity: 'low',
		deployment: 'local',
		externalIntegrations: 'none',
		source: 'inferred',
		updatedAt,
	};
}

async function gatherInferenceSignals(projectDir: string): Promise<InferenceSignals> {
	const stack = await detectProjectStack(projectDir);
	const loweredPath = projectDir.toLowerCase().replace(/\\/g, '/');
	return {
		hasConvex: stack.frameworks.includes('Convex'),
		isArchive:
			basename(projectDir).toLowerCase().endsWith('.old') || loweredPath.includes('/archive'),
		stackFamily: stack.family,
	};
}
