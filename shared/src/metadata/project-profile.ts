import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

import {
	isLowExposureLocalProfile,
	normalizeProjectAssuranceProfileFile,
	normalizeProjectAssuranceProfileInput,
	type ProjectAssuranceProfile,
	type ProjectAssuranceProfileInput,
	type ProjectCliBinary,
	type ProjectContainerImage,
	type ProjectTemplateOrigin,
	requiresFullHardening,
	isAuditApplicableToProfile as resolverIsAuditApplicableToProfile,
} from '../index.ts';
import { loadAuditProfileMapping, loadAuditProfileOverrides } from './audit-profile-mapping.ts';
import { metadataPath } from './paths.ts';
import { readProjectPackage } from './project-stack-evidence.ts';
import { detectProjectStack } from './project-stack.ts';

const projectProfileFileName = 'project-profile.json';

export { isLowExposureLocalProfile, requiresFullHardening };

interface InferenceSignals {
	carriage: CarriageFacets;
	hasConvex: boolean;
	isArchive: boolean;
	stackFamily: string;
}

/**
 * The carriage facets, as far as the filesystem alone can settle them.
 *
 * Two of the four have a top rung inference deliberately never reaches: a registry push and an
 * uploaded release archive both live in CI workflow YAML, and reading that here would mean parsing
 * every forge's syntax to answer a question the explicit profile answers directly. Inference stops
 * at the rung it can prove, which under-claims rather than over-claims — a gate scoped to
 * `published` is then withheld from a project nobody profiled, instead of applied to one that turns
 * out not to publish.
 */
interface CarriageFacets {
	derivesFromTemplate: ProjectTemplateOrigin;
	hasCliBinary: ProjectCliBinary;
	publishesReleaseArchives: 'none';
	shipsContainerImage: ProjectContainerImage;
}

export function projectProfilePath(projectDir: string): string {
	return join(metadataPath(projectDir), projectProfileFileName);
}

export async function readProjectAssuranceProfile(
	projectDir: string,
): Promise<ProjectAssuranceProfile> {
	const explicit = await readExplicitProjectAssuranceProfile(projectDir);
	if (explicit) return explicit;
	return await inferProjectAssuranceProfile(projectDir);
}

export async function writeProjectAssuranceProfile(
	projectDir: string,
	input: ProjectAssuranceProfileInput,
): Promise<ProjectAssuranceProfile> {
	const profile = normalizeProjectAssuranceProfileInput(input, new Date().toISOString());
	await mkdir(metadataPath(projectDir), { recursive: true });
	await writeFile(projectProfilePath(projectDir), `${JSON.stringify(profile, null, 2)}\n`);
	return profile;
}

export async function filterApplicableAuditNames(
	catalogDir: string,
	projectDir: string,
	auditNames: string[],
): Promise<string[]> {
	const profile = await readProjectAssuranceProfile(projectDir);
	const mapping = await loadAuditProfileMapping(catalogDir);
	const overrides = await loadAuditProfileOverrides(projectDir);
	return auditNames.filter((auditName) =>
		resolverIsAuditApplicableToProfile(profile, auditName, mapping, overrides),
	);
}

export async function readExplicitProjectAssuranceProfile(
	projectDir: string,
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
	projectDir: string,
): Promise<ProjectAssuranceProfile> {
	const signals = await gatherInferenceSignals(projectDir);
	const updatedAt = new Date().toISOString();
	const carriage = signals.carriage;
	if (signals.isArchive) {
		return {
			...carriage,
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
			...carriage,
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
			...carriage,
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
		...carriage,
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
		carriage: await inferCarriageFacets(projectDir),
		hasConvex: stack.frameworks.includes('Convex'),
		isArchive:
			basename(projectDir).toLowerCase().endsWith('.old') || loweredPath.includes('/archive'),
		stackFamily: stack.family,
	};
}

async function inferCarriageFacets(projectDir: string): Promise<CarriageFacets> {
	const manifest = await readProjectPackage(join(projectDir, 'package.json'));
	const scripts = Object.values(manifest?.scripts ?? {}).filter(
		(value): value is string => typeof value === 'string',
	);
	const compiles = scripts.some((script) => script.includes('--compile'));
	const hasBin = manifest?.bin !== undefined && manifest.bin !== null;
	return {
		// The template stamps `spernakit_version` into every app it scaffolds, so the app's own
		// manifest states its origin. The stack family does not: it reads `spernakit` for the
		// template itself, which derives from nothing.
		derivesFromTemplate:
			typeof manifest?.spernakit_version === 'string' ? 'spernakit' : ('none' as const),
		hasCliBinary: compiles ? 'packaged_binary' : hasBin ? 'script_entry' : ('none' as const),
		publishesReleaseArchives: 'none',
		shipsContainerImage: (await exists(join(projectDir, 'Dockerfile')))
			? 'local_only'
			: ('none' as const),
	};
}

async function exists(path: string): Promise<boolean> {
	try {
		await stat(path);
		return true;
	} catch {
		return false;
	}
}
