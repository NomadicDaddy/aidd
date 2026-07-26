export {
	buildFeatureNeighborhood,
	type FeatureGraphNode,
	type FeatureNeighborhood,
	featureNeighborhoodSchema,
	featureNodeId,
	findDanglingDependencies,
	findDependencyCycles,
} from './features/graph.ts';
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
	buildDependencyTopology,
	type FeatureDependencyTopology,
	featureDependencyTopologySchema,
} from './features/topology.ts';
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
