import type { ResolvedWebConfig } from 'aidd-shared/config';
import type { degitClone } from 'aidd-shared/git/degit';
import type { Feature } from 'aidd-shared/metadata/features';
import type { Roadmap } from 'aidd-shared/metadata/roadmap';
import type { LaunchTargetOverrides } from 'aidd-shared/plan/launch-target';

import type {
	ProjectCreateInputDto,
	ProjectCreateResultDto,
	ProjectDetailDto,
	ProjectFeatureDto,
	ProjectImportActionDto,
	ProjectImportCandidatesResponseDto,
	ProjectImportResultDto,
	ProjectIntakePreviewDto,
	ProjectNamesResponseDto,
	ProjectProfileUpdateDto,
	ProjectRecommendInputDto,
	ProjectRecommendResultDto,
	ProjectsListResponseDto,
	ProjectStartImplementationResultDto,
	RunLaunchRequest,
} from '../types.ts';
import type { FeatureMetadataInput } from './project/features.ts';
import type { MaturityContext } from './projectMetadata.ts';

import { HttpError } from './errors.ts';
import {
	type ActiveRunSummaryProvider,
	applyActiveRunSummaries,
} from './project/activeRunSummaries.ts';
import {
	createProject as createProjectInternal,
	type LaunchIntakeForCreate,
} from './project/create.ts';
import { ProjectFeatureService } from './project/featureService.ts';
import { startProjectImplementation } from './project/implementation.ts';
import { importProjects as importProjectsInternal, type LaunchIntake } from './project/imports.ts';
import { type ProjectInitFailureService } from './project/initFailureService.ts';
import { getIntakePreview as getIntakePreviewInternal } from './project/intakePreview.ts';
import {
	deleteProject as deleteProjectInternal,
	moveProject as moveProjectInternal,
	resolveDiscoveredProject as resolveDiscoveredProjectInternal,
	resolveProjectPath as resolveProjectPathInternal,
} from './project/lifecycle.ts';
import {
	getProjectDetail as getProjectDetailInternal,
	listImportCandidates as listImportCandidatesInternal,
	type ListingsContext,
	listProjectListings as listProjectListingsInternal,
	listProjectNames as listProjectNamesInternal,
	listProjects as listProjectsInternal,
} from './project/listings.ts';
import { ProjectListingCache } from './project/metadataCache.ts';
import { getPortStatusMap, type PortStatusMap } from './project/portStatusService.ts';
import {
	updateMaturitySkip as updateMaturitySkipInternal,
	updateProjectProfile as updateProjectProfileInternal,
} from './project/profile.ts';
import { recommendProjectMode as recommendProjectModeInternal } from './project/recommend.ts';
import {
	type FeatureApprovalInput,
	type ProjectAdvisorDeps,
	type ProjectDeleteInput,
	type ProjectMoveInput,
	type ProjectMoveResult,
	ProjectNotFoundError,
} from './project/types.ts';

export { ProjectNotFoundError };
export type {
	FeatureApprovalInput,
	FeatureMetadataInput,
	ProjectAdvisorDeps,
	ProjectDeleteInput,
	ProjectMoveInput,
	ProjectMoveResult,
};

export class ProjectService {
	private catalogDir: null | string = null;
	private config: ResolvedWebConfig;
	private maturityContext: MaturityContext | null = null;
	private advisor: null | ProjectAdvisorDeps = null;
	private listingCache = new ProjectListingCache();
	private initFailures: null | ProjectInitFailureService = null;
	private activeRunSummaryProvider: ActiveRunSummaryProvider | null = null;
	private readonly features = new ProjectFeatureService((id) =>
		this.resolveDiscoveredProject(id),
	);

	constructor(config: ResolvedWebConfig) {
		this.config = config;
	}
	setInitFailureService(service: ProjectInitFailureService): void {
		this.initFailures = service;
	}
	setActiveRunSummaryProvider(provider: ActiveRunSummaryProvider): void {
		this.activeRunSummaryProvider = provider;
	}
	approveFeature(projectId: string, dir: string, input: FeatureApprovalInput): Promise<Feature> {
		return this.features.approveFeature(projectId, dir, input);
	}
	deleteFeature(projectId: string, dir: string): Promise<{ id: string }> {
		return this.features.deleteFeature(projectId, dir);
	}
	updateFeatureStatus(projectId: string, dir: string, status: string): Promise<Feature> {
		return this.features.updateFeatureStatus(projectId, dir, status);
	}
	updateFeatureMetadata(
		projectId: string,
		dir: string,
		input: FeatureMetadataInput,
	): Promise<Feature> {
		return this.features.updateFeatureMetadata(projectId, dir, input);
	}
	updateFeatureMilestone(
		projectId: string,
		dir: string,
		milestone: string,
	): Promise<{ feature: ProjectFeatureDto; roadmap: Roadmap }> {
		return this.features.updateFeatureMilestone(projectId, dir, milestone);
	}
	invalidateProjectListing(projectPath: string): void {
		this.listingCache.invalidate(projectPath);
	}
	updateConfig(config: ResolvedWebConfig): void {
		this.config = config;
		this.listingCache = new ProjectListingCache();
	}
	setAdvisor(advisor: ProjectAdvisorDeps): void {
		this.advisor = advisor;
	}
	setCatalogDir(catalogDir: string): void {
		this.catalogDir = catalogDir;
		this.listingCache = new ProjectListingCache();
	}
	setMaturityContext(context: MaturityContext | null): void {
		this.maturityContext = context;
		if (context) this.catalogDir = context.auditCatalogDir;
		this.listingCache = new ProjectListingCache();
	}
	getAllowedRoots(): readonly string[] {
		return this.config.allowedRoots;
	}
	async getProjectDetail(projectId: string): Promise<ProjectDetailDto> {
		return getProjectDetailInternal(this.contextForListings(), projectId);
	}
	async listProjects(): Promise<ProjectsListResponseDto> {
		const response = await listProjectsInternal(this.contextForListings());
		await applyActiveRunSummaries(response, this.activeRunSummaryProvider);
		if (this.initFailures) response.initFailures = await this.initFailures.listOpen();
		return response;
	}
	async listProjectNames(): Promise<ProjectNamesResponseDto> {
		return listProjectNamesInternal(this.contextForListings());
	}
	async listProjectListings(): Promise<Awaited<ReturnType<typeof listProjectListingsInternal>>> {
		return listProjectListingsInternal(this.contextForListings());
	}
	async getPortStatus(): Promise<PortStatusMap> {
		return getPortStatusMap(this.config);
	}
	async listImportCandidates(): Promise<ProjectImportCandidatesResponseDto> {
		return listImportCandidatesInternal(this.contextForListings());
	}
	async getIntakePreview(path: string): Promise<ProjectIntakePreviewDto> {
		return getIntakePreviewInternal({ config: this.config }, path);
	}

	async importProjects(
		candidateIds: string[],
		action: ProjectImportActionDto,
		launchIntake: LaunchIntake,
	): Promise<ProjectImportResultDto> {
		return importProjectsInternal(
			this.contextForListings(),
			candidateIds,
			action,
			launchIntake,
		);
	}

	async createProject(
		input: ProjectCreateInputDto,
		launchRun: (req: RunLaunchRequest) => Promise<{ id: string }>,
		purgeProjectRuns: (projectPath: string) => Promise<number>,
		launchIntake?: LaunchIntakeForCreate,
		cloneTemplate?: typeof degitClone,
	): Promise<ProjectCreateResultDto> {
		return createProjectInternal(
			{ config: this.config },
			input,
			launchRun,
			purgeProjectRuns,
			launchIntake,
			(record) => this.initFailures?.record(record) ?? Promise.resolve(),
			cloneTemplate,
		);
	}

	async startImplementation(
		projectId: string,
		launchTarget: LaunchTargetOverrides,
		hasActiveRun: (projectPath: string) => Promise<boolean>,
		launchRun: (request: RunLaunchRequest) => Promise<{ id: string }>,
	): Promise<ProjectStartImplementationResultDto> {
		const projectDir = await this.resolveDiscoveredProject(projectId);
		if (await hasActiveRun(projectDir)) {
			throw new HttpError('Blueprint preparation is still running for this project.', 409);
		}
		return startProjectImplementation(projectDir, launchTarget, launchRun);
	}

	async recommendProjectMode(
		input: ProjectRecommendInputDto,
	): Promise<ProjectRecommendResultDto> {
		const advisor = this.advisor;
		if (!advisor) throw new Error('Project advisor is not initialized');
		return recommendProjectModeInternal(
			{
				backendFactory: advisor.backendFactory,
				directAiService: advisor.directAiService,
				getConfig: advisor.getFullConfig,
			},
			input,
		);
	}

	async resolveProjectPath(path: string): Promise<string> {
		return resolveProjectPathInternal({ config: this.config }, path);
	}

	async resolveDiscoveredProject(projectId: string): Promise<string> {
		return resolveDiscoveredProjectInternal({ config: this.config }, projectId);
	}

	async deleteProject(
		projectId: string,
		input: ProjectDeleteInput,
		hasActiveRuns: (projectPath: string) => Promise<boolean>,
		purgeProjectRuns: (projectPath: string) => Promise<number>,
	): Promise<{ id: string; mode: ProjectDeleteInput['mode']; path: string }> {
		return deleteProjectInternal(
			{ config: this.config },
			projectId,
			input,
			hasActiveRuns,
			purgeProjectRuns,
		);
	}

	async moveProject(
		projectId: string,
		input: ProjectMoveInput,
		hasActiveRuns: (projectPath: string) => Promise<boolean>,
		updateProjectPathReferences: (sourcePath: string, destinationPath: string) => Promise<void>,
	): Promise<ProjectMoveResult> {
		return moveProjectInternal(
			{ config: this.config },
			projectId,
			input,
			hasActiveRuns,
			updateProjectPathReferences,
		);
	}

	async updateMaturitySkip(projectId: string, skip: string[]): Promise<{ skip: string[] }> {
		return updateMaturitySkipInternal(
			{ resolveDiscoveredProject: (id) => this.resolveDiscoveredProject(id) },
			projectId,
			skip,
		);
	}

	async updateProjectProfile(
		projectId: string,
		input: ProjectProfileUpdateDto,
	): Promise<ProjectDetailDto['metadata']['profile']> {
		return updateProjectProfileInternal(
			{ resolveDiscoveredProject: (id) => this.resolveDiscoveredProject(id) },
			projectId,
			input,
		);
	}

	private contextForListings(): ListingsContext {
		return {
			catalogDir: this.catalogDir,
			config: this.config,
			listingCache: this.listingCache,
			maturityContext: this.maturityContext,
			resolveDiscoveredProject: (id) => this.resolveDiscoveredProject(id),
		};
	}
}
