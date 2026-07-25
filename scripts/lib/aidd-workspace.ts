export {
	collectFeatureStatus,
	discoverAiddProjects,
	summarizeFeatureStatus,
} from './aidd-workspace/discovery.ts';

export { applyRoadmap } from './aidd-workspace/roadmap.ts';

export {
	type FeatureStatusEntry,
	type FeatureStatusState,
	type FeatureStatusSummaryEntry,
	type FeatureStatusType,
	featureStatusTypes,
	type RoadmapApplySummary,
} from './aidd-workspace/types.ts';
