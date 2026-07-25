export {
	classifyFeatureStatusType,
	dependenciesAreSatisfied,
	featureMatchesQuery,
	isAuditFinding,
	isRemediationFeature,
	selectFeatureCandidates,
	selectNextFeature,
	summarizeFeatures,
} from './features/query.ts';
export {
	type Feature,
	type FeatureBlockingContext,
	type FeatureQuery,
	featureSchema,
	type FeatureSelectionOptions,
	type FeatureStats,
	type FeatureValidationResult,
} from './features/types.ts';
export {
	FEATURE_STATUSES,
	isValidFeatureStatus,
	validateFeatureCollection,
	validateFeatureContract,
} from './features/validation.ts';
