export const featureStatusTypes = ['audit', 'feature', 'remediation'] as const;

export type FeatureStatusType = (typeof featureStatusTypes)[number];
export type FeatureStatusState = 'completed' | 'pending';

export interface DiscoveredProject {
	name: string;
	projectDir: string;
}

export interface ProjectDiscoveryOptions {
	applications?: string[];
	applicationsRoot: string;
	requireFeaturesDir?: boolean;
}

export interface FeatureStatusEntry {
	application: string;
	completed: boolean;
	path: string;
	type: FeatureStatusType;
}

export interface FeatureStatusOptions {
	applications?: string[];
	applicationsRoot: string;
	state?: FeatureStatusState;
	types?: FeatureStatusType[];
}

export interface FeatureStatusSummaryEntry {
	application: string;
	audit: number;
	completed: number;
	feature: number;
	pending: number;
	remediation: number;
	total: number;
}

export interface RoadmapApplyOptions {
	dryRun?: boolean;
	now?: Date;
}

export interface RoadmapApplySummary {
	appName: string;
	dependenciesPreserved: number;
	dependenciesWritten: number;
	dryRun: boolean;
	errors: string[];
	milestones: RoadmapMilestoneSummary[];
	missing: number;
	projectDir: string;
	skipped: number;
	total: number;
	updated: number;
	warnings: string[];
}

export interface RoadmapMilestoneSummary {
	count: number;
	description?: string;
	milestone: string;
	priority: number;
}

export interface RoadmapFeaturePlan {
	dependencies?: string[];
	dirName: string;
	feature: Record<string, unknown>;
	filePath: string;
	priority: number;
}

export interface RoadmapChangePlan extends RoadmapFeaturePlan {
	changed: boolean;
}
