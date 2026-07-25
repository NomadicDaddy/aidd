import { stat } from 'node:fs/promises';
import { isAbsolute, join, normalize } from 'node:path';

import { reviewLicenseExpression } from '../license-core/expression.ts';
import { type PackagedTrackedSurfaces } from './distributed-paths.ts';
import { REGISTRY_LICENSE_NOTICES } from './registry-license-notices.ts';
import {
	DISTRIBUTED_MATERIALS_REGISTRY,
	type DistributedMaterialsRegistry,
	type ThirdPartyMaterial,
} from './registry-types.ts';

export interface RegistryValidationOptions {
	distributedPaths: readonly string[];
	fileExists: (relativePath: string) => Promise<boolean>;
	packagedSurfaces: PackagedTrackedSurfaces;
}

const EXACT_PATH_FORBIDDEN = /[*?[\]{}]/;
const FLOATING_SOURCE = /(?:^|[/@])(main|master|head|latest)(?:$|[/#?])/i;
const REVISION = /^[0-9a-f]{40}$/;
const VERSION = /^v?\d+(?:\.\d+){1,3}(?:[-+][0-9A-Za-z.-]+)?$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const REQUIRED_RENDER_TARGETS = ['THIRD-PARTY-LICENSES.md', 'THIRD-PARTY-NOTICES.md'];

function isExactPath(path: string): boolean {
	return (
		path.length > 0 &&
		!isAbsolute(path) &&
		!path.startsWith('/') &&
		!path.includes('\\') &&
		!EXACT_PATH_FORBIDDEN.test(path) &&
		normalize(path).replaceAll('\\', '/') === path &&
		!path.endsWith('/')
	);
}

function validateSource(material: ThirdPartyMaterial, issues: string[]): void {
	const label = `third-party record ${material.id}`;
	for (const [field, value] of [
		['sourceUrl', material.sourceUrl],
		['licenseEvidenceUrl', material.licenseEvidenceUrl],
	] as const) {
		if (!value.startsWith('https://')) issues.push(`${label} ${field} must use HTTPS.`);
		if (FLOATING_SOURCE.test(value)) issues.push(`${label} ${field} is floating: ${value}`);
	}

	if (material.sourceRevision) {
		if (!REVISION.test(material.sourceRevision)) {
			issues.push(`${label} sourceRevision must be a 40-character lowercase Git SHA.`);
		} else {
			for (const url of [material.sourceUrl, material.licenseEvidenceUrl]) {
				if (!url.includes(material.sourceRevision)) {
					issues.push(`${label} pinned URL does not contain sourceRevision: ${url}`);
				}
			}
		}
	} else if (material.sourceVersion) {
		if (!VERSION.test(material.sourceVersion)) {
			issues.push(
				`${label} sourceVersion is not an immutable version: ${material.sourceVersion}`,
			);
		}
		for (const [field, url] of [
			['sourceUrl', material.sourceUrl],
			['licenseEvidenceUrl', material.licenseEvidenceUrl],
		] as const) {
			if (!url.includes(material.sourceVersion)) {
				issues.push(`${label} ${field} does not contain sourceVersion.`);
			}
		}
	} else {
		issues.push(`${label} must declare sourceRevision or sourceVersion.`);
	}
}

function validateMaterial(material: ThirdPartyMaterial, issues: string[]): void {
	validateSource(material, issues);
	if (!DATE.test(material.provenanceVerified)) {
		issues.push(`third-party record ${material.id} has an invalid provenanceVerified date.`);
	}
	const review = reviewLicenseExpression(material.licenseExpression, {
		reviewed: new Set(Object.keys(REGISTRY_LICENSE_NOTICES)),
	});
	if (!review.ok) {
		const detail = review.error ?? `unreviewed: ${review.unreviewed.join(', ')}`;
		issues.push(`third-party record ${material.id} has unknown license expression: ${detail}`);
	}
}

export function allClassifiedPaths(registry: DistributedMaterialsRegistry): string[] {
	return [
		...registry.classifications.firstParty,
		...registry.classifications.generated,
		...registry.classifications.thirdParty.flatMap((material) => material.coveredPaths),
	];
}

function validateSurfacePaths(
	label: string,
	declared: readonly string[],
	expected: readonly string[],
	issues: string[],
): void {
	const declaredSet = new Set(declared);
	const expectedSet = new Set(expected);
	for (const path of declared) {
		if (!isExactPath(path)) issues.push(`${label} path is not exact: ${path}`);
	}
	if (declaredSet.size !== declared.length)
		issues.push(`${label} paths must not contain duplicates.`);
	for (const path of expectedSet) {
		if (!declaredSet.has(path)) issues.push(`${label} is missing packaged path: ${path}`);
	}
	for (const path of declaredSet) {
		if (!expectedSet.has(path))
			issues.push(`${label} declares path not used by packaging: ${path}`);
	}
}

function validateTrackedSurfaces(
	registry: DistributedMaterialsRegistry,
	packaged: PackagedTrackedSurfaces,
	issues: string[],
): void {
	validateSurfacePaths(
		'trackedSurfaces.catalogRoots',
		registry.trackedSurfaces.catalogRoots,
		packaged.catalogRoots,
		issues,
	);
	validateSurfacePaths(
		'trackedSurfaces.publicDocumentPaths',
		registry.trackedSurfaces.publicDocumentPaths,
		packaged.publicDocumentPaths,
		issues,
	);
	validateSurfacePaths(
		'trackedSurfaces.publicDocumentRoots',
		registry.trackedSurfaces.publicDocumentRoots,
		packaged.publicDocumentRoots,
		issues,
	);
	for (const path of registry.trackedSurfaces.publicStaticAssetRoots) {
		if (!isExactPath(path)) {
			issues.push(`trackedSurfaces.publicStaticAssetRoots path is not exact: ${path}`);
		}
	}
	if (
		new Set(registry.trackedSurfaces.publicStaticAssetRoots).size !==
		registry.trackedSurfaces.publicStaticAssetRoots.length
	) {
		issues.push('trackedSurfaces.publicStaticAssetRoots paths must not contain duplicates.');
	}
}

export async function validateDistributedMaterialsRegistry(
	registry: DistributedMaterialsRegistry,
	options: RegistryValidationOptions,
): Promise<string[]> {
	const issues: string[] = [];
	const classified = allClassifiedPaths(registry);
	const expected = new Set(options.distributedPaths);
	const seenPaths = new Set<string>();
	const seenIds = new Set<string>();
	validateTrackedSurfaces(registry, options.packagedSurfaces, issues);

	for (const path of classified) {
		if (!isExactPath(path)) issues.push(`Classified path is not exact: ${path}`);
		if (seenPaths.has(path)) issues.push(`Distributed path has duplicate ownership: ${path}`);
		seenPaths.add(path);
		if (!(await options.fileExists(path))) issues.push(`Registered path is missing: ${path}`);
	}

	for (const path of expected) {
		if (!seenPaths.has(path)) issues.push(`Distributed path is unclassified: ${path}`);
	}
	for (const path of seenPaths) {
		if (!expected.has(path))
			issues.push(`Registered path is outside the distributed set: ${path}`);
	}

	for (const material of registry.classifications.thirdParty) {
		if (seenIds.has(material.id))
			issues.push(`Duplicate third-party record id: ${material.id}`);
		seenIds.add(material.id);
		validateMaterial(material, issues);
		for (const target of REQUIRED_RENDER_TARGETS) {
			if (!material.requiredNoticeFiles.includes(target)) {
				issues.push(`Required notice target is undeclared for ${material.id}: ${target}`);
			}
		}
		for (const path of material.requiredNoticeFiles) {
			if (!isExactPath(path)) issues.push(`Required notice path is not exact: ${path}`);
			if (!seenPaths.has(path)) {
				issues.push(`Required notice file is unclassified for ${material.id}: ${path}`);
			}
			if (!(await options.fileExists(path))) {
				issues.push(`Required notice file is missing for ${material.id}: ${path}`);
			}
		}
	}

	if (!seenPaths.has(DISTRIBUTED_MATERIALS_REGISTRY)) {
		issues.push(`${DISTRIBUTED_MATERIALS_REGISTRY} must classify itself.`);
	}
	return [...new Set(issues)].sort();
}

export function rootFileExists(root: string): (relativePath: string) => Promise<boolean> {
	return async (relativePath) =>
		await stat(join(root, relativePath))
			.then((value) => value.isFile())
			.catch(() => false);
}
