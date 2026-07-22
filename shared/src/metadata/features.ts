export {
	classifyFeatureStatusType,
	dependenciesAreSatisfied,
	featureMatchesQuery,
	isAuditFinding,
	isRemediationFeature,
	selectNextFeature,
	summarizeFeatures,
} from './features/query.ts';
export {
	featureBlockingContextSchema,
	featureSchema,
	type Feature,
	type FeatureBlockingContext,
	type FeatureQuery,
	type FeatureSelectionOptions,
	type FeatureStats,
	type FeatureStatusType,
	type FeatureValidationIssue,
	type FeatureValidationResult,
	type FeatureCollectionValidationResult,
} from './features/types.ts';
export {
	FEATURE_STATUSES,
	type FeatureStatus,
	isValidFeatureStatus,
	validateFeatureCollection,
	validateFeatureContract,
} from './features/validation.ts';
