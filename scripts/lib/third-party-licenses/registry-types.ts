export const DISTRIBUTED_MATERIALS_REGISTRY = 'licenses/distributed-materials.json';

export const DISTRIBUTION_SURFACES = ['source-tree', 'release-archive'] as const;

export type DistributionSurface = (typeof DISTRIBUTION_SURFACES)[number];
export type ModificationStatus = 'adapted' | 'unmodified';

export interface ThirdPartyMaterial {
	authorOrRightsholder: string;
	coveredPaths: string[];
	distributionSurfaces: DistributionSurface[];
	id: string;
	licenseEvidenceUrl: string;
	licenseExpression: string;
	modificationStatus: ModificationStatus;
	noticeText: string;
	provenanceEvidence?: string;
	provenanceVerified: string;
	requiredNoticeFiles: string[];
	sourceRevision?: string;
	sourceUrl: string;
	sourceVersion?: string;
}

export interface TrackedSurfaces {
	catalogRoots: string[];
	publicDocumentPaths: string[];
	publicDocumentRoots: string[];
	publicStaticAssetRoots: string[];
}

export interface DistributedMaterialClassifications {
	firstParty: string[];
	generated: string[];
	thirdParty: ThirdPartyMaterial[];
}

export interface DistributedMaterialsRegistry {
	classifications: DistributedMaterialClassifications;
	pathContract: string;
	schemaVersion: number;
	trackedSurfaces: TrackedSurfaces;
	verifiedDate: string;
}
