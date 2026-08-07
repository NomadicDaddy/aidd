import type { Feature } from 'aidd-shared/metadata/features';
import type { Roadmap } from 'aidd-shared/metadata/roadmap';

import { FileAiddStore } from 'aidd-shared/metadata/store';

import type { ProjectFeatureDto } from '../../types.ts';
import type { FeatureApprovalInput } from './types.ts';

import {
	approveFeature as approveFeatureInternal,
	deleteFeature as deleteFeatureInternal,
	type FeatureContext,
	type FeatureMetadataInput,
	readFeature as readFeatureInternal,
	updateFeatureMetadata as updateFeatureMetadataInternal,
	updateFeatureMilestone as updateFeatureMilestoneInternal,
	updateFeatureStatus as updateFeatureStatusInternal,
} from './features.ts';
import { withRoadmapMilestone } from './listings/featureMappers.ts';

// Feature CRUD delegators, split out of ProjectService so that facade stays within the
// modularity budget. Builds its FeatureContext from the shared project resolver.
export class ProjectFeatureService {
	private readonly resolveProject: (id: string) => Promise<string>;

	constructor(resolveProject: (id: string) => Promise<string>) {
		this.resolveProject = resolveProject;
	}

	private context(): FeatureContext {
		return {
			resolveDiscoveredProject: (id) => this.resolveProject(id),
			storeForProject: async (id) => new FileAiddStore(await this.resolveProject(id)),
		};
	}

	async approveFeature(
		projectId: string,
		featureDirectory: string,
		input: FeatureApprovalInput,
	): Promise<Feature> {
		return approveFeatureInternal(this.context(), projectId, featureDirectory, input);
	}

	async deleteFeature(projectId: string, featureDirectory: string): Promise<{ id: string }> {
		return deleteFeatureInternal(this.context(), projectId, featureDirectory);
	}

	// Answers with the same shape a list row has, plus the prose the list projection drops.
	async readFeature(projectId: string, featureDirectory: string): Promise<ProjectFeatureDto> {
		const { feature, roadmap } = await readFeatureInternal(
			this.context(),
			projectId,
			featureDirectory,
		);
		return withRoadmapMilestone(feature, roadmap);
	}

	async updateFeatureMetadata(
		projectId: string,
		featureDirectory: string,
		input: FeatureMetadataInput,
	): Promise<Feature> {
		return updateFeatureMetadataInternal(this.context(), projectId, featureDirectory, input);
	}

	async updateFeatureStatus(
		projectId: string,
		featureDirectory: string,
		statusInput: string,
	): Promise<Feature> {
		return updateFeatureStatusInternal(
			this.context(),
			projectId,
			featureDirectory,
			statusInput,
		);
	}

	async updateFeatureMilestone(
		projectId: string,
		featureDirectory: string,
		milestoneInput: string,
	): Promise<{ feature: ProjectFeatureDto; roadmap: Roadmap }> {
		return updateFeatureMilestoneInternal(
			this.context(),
			projectId,
			featureDirectory,
			milestoneInput,
		);
	}
}
