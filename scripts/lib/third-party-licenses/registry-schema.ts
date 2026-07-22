import {
	DISTRIBUTION_SURFACES,
	type DistributionSurface,
	type DistributedMaterialsRegistry,
	type ModificationStatus,
	type ThirdPartyMaterial,
	type TrackedSurfaces,
} from './registry-types.ts';

const DISTRIBUTION_SURFACE_SET = new Set<string>(DISTRIBUTION_SURFACES);

function objectAt(value: unknown, path: string, issues: string[]): Record<string, unknown> {
	if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
		return value as Record<string, unknown>;
	}
	issues.push(`${path} must be an object.`);
	return {};
}

function stringAt(
	object: Record<string, unknown>,
	key: string,
	path: string,
	issues: string[]
): string {
	const value = object[key];
	if (typeof value === 'string' && value.trim().length > 0) return value;
	issues.push(`${path}.${key} must be a non-empty string.`);
	return '';
}

function optionalStringAt(
	object: Record<string, unknown>,
	key: string,
	path: string,
	issues: string[]
): string | undefined {
	const value = object[key];
	if (value === undefined) return undefined;
	if (typeof value === 'string' && value.trim().length > 0) return value;
	issues.push(`${path}.${key} must be a non-empty string when present.`);
	return undefined;
}

function stringsAt(
	object: Record<string, unknown>,
	key: string,
	path: string,
	issues: string[]
): string[] {
	const value = object[key];
	if (!Array.isArray(value) || value.length === 0) {
		issues.push(`${path}.${key} must be a non-empty string array.`);
		return [];
	}
	const strings = value.filter(
		(entry): entry is string => typeof entry === 'string' && entry.trim().length > 0
	);
	if (strings.length !== value.length) {
		issues.push(`${path}.${key} must contain only non-empty strings.`);
	}
	return strings;
}

function distributionSurfacesAt(
	object: Record<string, unknown>,
	path: string,
	issues: string[]
): DistributionSurface[] {
	const surfaces = stringsAt(object, 'distributionSurfaces', path, issues);
	for (const surface of surfaces) {
		if (!DISTRIBUTION_SURFACE_SET.has(surface)) {
			issues.push(`${path}.distributionSurfaces contains unsupported surface "${surface}".`);
		}
	}
	if (new Set(surfaces).size !== surfaces.length) {
		issues.push(`${path}.distributionSurfaces must not contain duplicates.`);
	}
	return surfaces.filter((surface): surface is DistributionSurface =>
		DISTRIBUTION_SURFACE_SET.has(surface)
	);
}

function thirdPartyAt(value: unknown, index: number, issues: string[]): ThirdPartyMaterial {
	const path = `classifications.thirdParty[${index}]`;
	const object = objectAt(value, path, issues);
	const rawStatus = stringAt(object, 'modificationStatus', path, issues);
	const provenanceEvidence = optionalStringAt(object, 'provenanceEvidence', path, issues);
	const sourceRevision = optionalStringAt(object, 'sourceRevision', path, issues);
	const sourceVersion = optionalStringAt(object, 'sourceVersion', path, issues);
	if (rawStatus !== 'adapted' && rawStatus !== 'unmodified') {
		issues.push(`${path}.modificationStatus must be "adapted" or "unmodified".`);
	}
	return {
		authorOrRightsholder: stringAt(object, 'authorOrRightsholder', path, issues),
		coveredPaths: stringsAt(object, 'coveredPaths', path, issues),
		distributionSurfaces: distributionSurfacesAt(object, path, issues),
		id: stringAt(object, 'id', path, issues),
		licenseEvidenceUrl: stringAt(object, 'licenseEvidenceUrl', path, issues),
		licenseExpression: stringAt(object, 'licenseExpression', path, issues),
		modificationStatus: rawStatus as ModificationStatus,
		noticeText: stringAt(object, 'noticeText', path, issues),
		provenanceVerified: stringAt(object, 'provenanceVerified', path, issues),
		...(provenanceEvidence ? { provenanceEvidence } : {}),
		requiredNoticeFiles: stringsAt(object, 'requiredNoticeFiles', path, issues),
		...(sourceRevision ? { sourceRevision } : {}),
		sourceUrl: stringAt(object, 'sourceUrl', path, issues),
		...(sourceVersion ? { sourceVersion } : {}),
	};
}

function surfacesAt(value: unknown, issues: string[]): TrackedSurfaces {
	const path = 'trackedSurfaces';
	const object = objectAt(value, path, issues);
	return {
		catalogRoots: stringsAt(object, 'catalogRoots', path, issues),
		publicDocumentPaths: stringsAt(object, 'publicDocumentPaths', path, issues),
		publicDocumentRoots: stringsAt(object, 'publicDocumentRoots', path, issues),
		publicStaticAssetRoots: stringsAt(object, 'publicStaticAssetRoots', path, issues),
	};
}

export function parseDistributedMaterialsRegistry(value: unknown): DistributedMaterialsRegistry {
	const issues: string[] = [];
	const root = objectAt(value, 'registry', issues);
	const classifications = objectAt(root.classifications, 'classifications', issues);
	const thirdParty = Array.isArray(classifications.thirdParty)
		? classifications.thirdParty.map((entry, index) => thirdPartyAt(entry, index, issues))
		: [];
	if (!Array.isArray(classifications.thirdParty) || thirdParty.length === 0) {
		issues.push('classifications.thirdParty must be a non-empty array.');
	}
	if (root.schemaVersion !== 1) issues.push('schemaVersion must be 1.');

	const registry: DistributedMaterialsRegistry = {
		classifications: {
			firstParty: stringsAt(classifications, 'firstParty', 'classifications', issues),
			generated: stringsAt(classifications, 'generated', 'classifications', issues),
			thirdParty,
		},
		pathContract: stringAt(root, 'pathContract', 'registry', issues),
		schemaVersion: 1,
		trackedSurfaces: surfacesAt(root.trackedSurfaces, issues),
		verifiedDate: stringAt(root, 'verifiedDate', 'registry', issues),
	};

	if (issues.length > 0) {
		throw new Error(
			`Invalid distributed-materials registry:\n${issues.map((issue) => `- ${issue}`).join('\n')}`
		);
	}
	return registry;
}
