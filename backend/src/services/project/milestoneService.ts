import { FileAiddStore } from 'aidd-shared/metadata/store';

import type {
	MilestoneCreateInputDto,
	MilestoneDeleteInputDto,
	MilestoneUpdateInputDto,
	ProjectMilestonePlanDto,
	ProjectMilestonesViewDto,
} from '../../types/project/milestones.ts';

import {
	createMilestone as createMilestoneInternal,
	deleteMilestone as deleteMilestoneInternal,
	getMilestones as getMilestonesInternal,
	type HasActiveRuns,
	type MilestoneContext,
	reassignMilestones as reassignMilestonesInternal,
	updateMilestone as updateMilestoneInternal,
} from './milestones.ts';

// Roadmap milestone delegators, split out of ProjectService the same way ProjectFeatureService is so
// the facade stays within the modularity budget.
export class ProjectMilestoneService {
	private readonly resolveProject: (id: string) => Promise<string>;

	constructor(resolveProject: (id: string) => Promise<string>) {
		this.resolveProject = resolveProject;
	}

	private context(): MilestoneContext {
		return {
			resolveDiscoveredProject: (id) => this.resolveProject(id),
			storeForProject: async (id) => new FileAiddStore(await this.resolveProject(id)),
		};
	}

	async getMilestones(projectId: string): Promise<ProjectMilestonesViewDto> {
		return getMilestonesInternal(this.context(), projectId);
	}

	async createMilestone(
		projectId: string,
		input: MilestoneCreateInputDto,
		hasActiveRuns: HasActiveRuns,
	): Promise<ProjectMilestonePlanDto> {
		return createMilestoneInternal(this.context(), projectId, input, hasActiveRuns);
	}

	async updateMilestone(
		projectId: string,
		milestone: string,
		input: MilestoneUpdateInputDto,
		hasActiveRuns: HasActiveRuns,
	): Promise<ProjectMilestonePlanDto> {
		return updateMilestoneInternal(this.context(), projectId, milestone, input, hasActiveRuns);
	}

	async deleteMilestone(
		projectId: string,
		milestone: string,
		input: MilestoneDeleteInputDto,
		hasActiveRuns: HasActiveRuns,
	): Promise<ProjectMilestonePlanDto> {
		return deleteMilestoneInternal(this.context(), projectId, milestone, input, hasActiveRuns);
	}

	async reassignMilestones(
		projectId: string,
		input: { dryRun?: boolean },
		hasActiveRuns: HasActiveRuns,
	): Promise<ProjectMilestonePlanDto> {
		return reassignMilestonesInternal(this.context(), projectId, input, hasActiveRuns);
	}
}
