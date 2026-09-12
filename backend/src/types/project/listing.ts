import type { ProjectStack } from 'aidd-shared/metadata/project-stack';

import type { DirectorPriorityHealth } from '../director.ts';
import type {
	WebFeatureStats,
	WebFeatureStatusEntryDto,
	WebFeatureSummaryDto,
} from './features.ts';
import type { ProjectMetadataDto } from './metadata.ts';

export type ProjectSummaryMetadataDto = {
	usage: Pick<ProjectMetadataDto['usage'], 'recentDailyTokens' | 'totals'>;
} & Omit<ProjectMetadataDto, 'usage'>;

export interface ProjectActiveRunSummaryDto {
	count: number;
	latestRunId: null | string;
}

export interface ProjectSummaryDto {
	activeRuns: ProjectActiveRunSummaryDto;
	artifactHealth: 'fresh' | 'missing' | 'stale' | 'unknown';
	featureStats: WebFeatureStats;
	featureStatus: WebFeatureStatusEntryDto[];
	featureSummary: WebFeatureSummaryDto;
	id: string;
	/** True when this project is a spernakit template checkout (name 'spernakit' + portable generator). */
	isSpernakitTemplate?: boolean;
	metadata: ProjectSummaryMetadataDto;
	name: string;
	path: string;
	phase: 'coding' | 'initializer' | 'onboarding';
	priorityHealth: DirectorPriorityHealth;
	root: string;
	routeId: string;
}

export interface ProjectDiscoverySkippedRootDto {
	path: string;
	reason: string;
}

export interface ProjectInitFailureDto {
	createdAt: number;
	description: null | string;
	errorSummary: string;
	hasLog: boolean;
	id: string;
	name: string;
	quarantinePath: null | string;
	root: string;
	targetPath: string;
	template: string;
	// GitHub template source (owner/repo[#ref]) when the failure came from a templateUrl
	// create; retry forwards it as templateUrl. Null for registered templates.
	templateUrl: null | string;
}

export interface ProjectsListResponseDto {
	// Open template-init failures, surfaced alongside discovered projects so a broken
	// scaffold stays visible with retry/dismiss actions instead of vanishing.
	initFailures: ProjectInitFailureDto[];
	projects: ProjectSummaryDto[];
	skippedRoots: ProjectDiscoverySkippedRootDto[];
	/** Version of the spernakit template checkout aidd would sync/create from; null when unknown. */
	spernakitTemplateVersion: null | string;
}

export interface ProjectNameSummaryDto {
	id: string;
	/**
	 * Set only for the spernakit template checkout, mirroring `ProjectSummaryDto`, so a caller
	 * counting projects can apply the same `web.showSpernakitProject` filter the projects page
	 * does without paying for the full listing scan.
	 */
	isSpernakitTemplate?: boolean;
	name: string;
	path: string;
	routeId: string;
}

export interface ProjectNamesResponseDto {
	projects: ProjectNameSummaryDto[];
	skippedRoots: ProjectDiscoverySkippedRootDto[];
}

export interface ProjectImportCandidateSignalDto {
	aidd: boolean;
	git: boolean;
	packageJson: boolean;
}

export interface ProjectImportCandidateDto {
	canImport: boolean;
	id: string;
	name: string;
	path: string;
	reason: null | string;
	root: string;
	signals: ProjectImportCandidateSignalDto;
}

export interface ProjectImportCandidatesResponseDto {
	candidates: ProjectImportCandidateDto[];
	skippedRoots: ProjectDiscoverySkippedRootDto[];
}

export type ProjectImportActionDto = 'ingest' | 'register';

export interface ProjectIntakeGitSummaryDto {
	branch: null | string;
	dirtyCount: number;
	lastCommit: { date: string; hash: string; subject: string } | null;
}

export interface ProjectIntakePreviewDto {
	git: null | ProjectIntakeGitSummaryDto;
	hasAidd: boolean;
	likelyPhase: 'coding' | 'initializer' | 'onboarding';
	name: string;
	path: string;
	spernakit: { fileSignals: boolean; inManifest: boolean; manifestVersion: null | string };
	stack: ProjectStack;
	workspaceRoot: { detected: boolean; subprojectCount: number };
}

export interface ProjectImportCandidateResultDto {
	candidateId: string;
	error: null | string;
	intakeSessionId: null | string;
	path: string;
	projectId: null | string;
	runId: null | string;
	status: 'failed' | 'imported';
}

export interface ProjectImportResultDto {
	results: ProjectImportCandidateResultDto[];
}
