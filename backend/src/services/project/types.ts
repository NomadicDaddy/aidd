import type { CLIBackend } from 'aidd-shared/backends/types';
import type { ResolvedConfig, ResolvedWebConfig } from 'aidd-shared/config';
import type { FindingDismissalReason } from 'aidd-shared/contracts/finding-dispositions';
import type { BackendName } from 'aidd-shared/plan/types';

import type { DirectAiRunner } from '../directAiService.ts';

import { HttpError } from '../errors.ts';

export interface ProjectAdvisorDeps {
	backendFactory: (name: BackendName) => CLIBackend;
	directAiService: DirectAiRunner;
	getFullConfig: () => { web: ResolvedWebConfig } & ResolvedConfig;
}

export class ProjectNotFoundError extends HttpError {
	constructor(message: string) {
		super(message, 404);
		this.name = 'ProjectNotFoundError';
	}
}

export type ProjectFeatureStatus = 'backlog' | 'completed' | 'in_progress' | 'waiting_approval';

export interface FeatureApprovalInput {
	decision: null | string;
	decisionRequired: boolean;
}

export interface FindingDismissalInput {
	note?: string;
	reason: FindingDismissalReason;
}

export interface ProjectDeleteInput {
	confirmation: string;
	mode: 'directory' | 'metadata';
}

export interface ProjectMoveInput {
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

export const PROJECT_FEATURE_STATUSES = new Set<ProjectFeatureStatus>([
	'backlog',
	'completed',
	'in_progress',
	'waiting_approval',
]);
