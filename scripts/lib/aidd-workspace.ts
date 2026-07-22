export {
	collectFeatureStatus,
	discoverAiddProjects,
	summarizeFeatureStatus,
} from './aidd-workspace/discovery.ts';

export { applyRoadmap } from './aidd-workspace/roadmap.ts';

export {
	featureStatusTypes,
	type DiscoveredProject,
	type FeatureStatusEntry,
	type FeatureStatusOptions,
	type FeatureStatusState,
	type FeatureStatusSummaryEntry,
	type FeatureStatusType,
	type ProjectDiscoveryOptions,
	type RoadmapApplyOptions,
	type RoadmapApplySummary,
	type RoadmapMilestoneSummary,
} from './aidd-workspace/types.ts';
