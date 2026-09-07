import type { ProjectStack } from 'aidd-shared/metadata/project-stack';

import type { BackendName } from '../skills.ts';
import type { ProjectImplementationFeature, ProjectSummary } from './metadata.ts';

export interface ProjectDiscoverySkippedRoot {
	path: string;
	reason: string;
}

export interface ProjectInitFailure {
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
	templateUrl: null | string;
}

export interface ProjectsListResponse {
	initFailures: ProjectInitFailure[];
	projects: ProjectSummary[];
	skippedRoots: ProjectDiscoverySkippedRoot[];
	/** Version of the spernakit template checkout aidd would sync/create from; null when unknown. */
	spernakitTemplateVersion: null | string;
}

export interface ProjectNameSummary {
	id: string;
	name: string;
	path: string;
	routeId: string;
}

export interface ProjectNamesResponse {
	projects: ProjectNameSummary[];
	skippedRoots: ProjectDiscoverySkippedRoot[];
}

export interface PortStatusEntry {
	backend: boolean | null;
	frontend: boolean | null;
}

export type PortStatusResponse = Record<string, PortStatusEntry>;

export type ProjectGitStatusState =
	'clean' | 'conflicted' | 'dirty' | 'error' | 'not-a-repo' | 'project-missing';

export interface ProjectGitStatusSummary {
	ahead: number;
	behind: number;
	branch: null | string;
	conflicted: number;
	staged: number;
	state: ProjectGitStatusState;
	total: number;
	unstaged: number;
	untracked: number;
}

export interface ProjectGitStatusMapEntry {
	id: string;
	path: string;
	status: ProjectGitStatusSummary;
}

export interface ProjectGitStatusResponse {
	status: ProjectGitStatusSummary;
}

export interface ProjectsGitStatusResponse {
	projects: Record<string, ProjectGitStatusMapEntry>;
}

export interface ProjectImportCandidateSignal {
	aidd: boolean;
	git: boolean;
	packageJson: boolean;
}

export interface ProjectIntakeGitSummary {
	branch: null | string;
	dirtyCount: number;
	lastCommit: { date: string; hash: string; subject: string } | null;
}

export interface ProjectIntakePreview {
	git: null | ProjectIntakeGitSummary;
	hasAidd: boolean;
	likelyPhase: 'coding' | 'initializer' | 'onboarding';
	name: string;
	path: string;
	spernakit: { fileSignals: boolean; inManifest: boolean; manifestVersion: null | string };
	stack: ProjectStack;
	workspaceRoot: { detected: boolean; subprojectCount: number };
}

export interface ProjectImportCandidate {
	canImport: boolean;
	id: string;
	name: string;
	path: string;
	reason: null | string;
	root: string;
	signals: ProjectImportCandidateSignal;
}

export interface ProjectImportCandidatesResponse {
	candidates: ProjectImportCandidate[];
	skippedRoots: ProjectDiscoverySkippedRoot[];
}

export type ProjectImportAction = 'ingest' | 'register';

export interface ProjectImportCandidateResult {
	candidateId: string;
	error: null | string;
	intakeSessionId: null | string;
	path: string;
	projectId: null | string;
	runId: null | string;
	status: 'failed' | 'imported';
}

export interface ProjectImportResult {
	results: ProjectImportCandidateResult[];
}

export type ProjectDeleteMode = 'directory' | 'metadata';

export interface ProjectDeleteRequest {
	confirmation: string;
	mode: ProjectDeleteMode;
}

export interface ProjectDeleteResult {
	id: string;
	mode: ProjectDeleteMode;
	path: string;
}

export interface ProjectMoveRequest {
	confirmation: string;
	destinationName?: string;
	destinationRoot: string;
}

export interface ProjectMoveResult {
	id: string;
	name: string;
	path: string;
	previousId: string;
	previousPath: string;
}

export type ProjectCreateMode = 'fresh' | 'spernakit';

export type ProjectRecommendMode = 'fresh' | 'ingest' | 'spernakit';

export interface ProjectCreateSpecInput {
	kind: 'path' | 'text';
	value: string;
}

export interface ProjectCreateInput {
	/** Optional launch-target override for the first run/intake session. */
	backend?: BackendName;
	description?: string;
	mode: ProjectCreateMode;
	model?: string;
	name: string;
	reasoningEffort?: string;
	root: string;
	spec?: ProjectCreateSpecInput;
	/** Defaults to true when omitted. */
	stopBeforeImplementation?: boolean;
	/** Registered template name; when set it takes precedence over `mode`. */
	template?: string;
	/** GitHub template repo source (URL or owner/repo[#ref]); mutually exclusive with `template`. */
	templateUrl?: string;
}

export interface ProjectCreateResult {
	/** Pipeline session id for a scaffold-then-ingest (postCreate 'ingest') template. */
	intakeSessionId: null | string;
	mode: ProjectCreateMode;
	path: string;
	projectId: string;
	runId: null | string;
	stopBeforeImplementation: boolean;
}

export interface ProjectStartImplementationResult {
	feature: ProjectImplementationFeature;
	runId: string;
}

export interface ProjectRecommendInput {
	name: string;
	path?: string;
	root?: string;
	spec: ProjectCreateSpecInput;
}

export interface ProjectRecommendResult {
	mode: ProjectRecommendMode;
	reasoning: string;
}
