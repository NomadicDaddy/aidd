import type { ProjectAssuranceProfileInput } from 'aidd-shared';
import type { BlueprintSetupActivity } from 'aidd-shared/metadata/blueprint-setup';
import type { LaunchTargetOverrides } from 'aidd-shared/plan/launch-target';

import type { MaturityDto } from '../maturity.ts';
import type { ProjectFeatureDto } from './features.ts';
import type { ProjectSummaryDto } from './listing.ts';
import type { ProjectMetadataDto } from './metadata.ts';

export type ProjectCreateMode = 'fresh' | 'spernakit';

// The advisor may also recommend ingesting an existing directory, which is not a
// create mode (no scaffold runs) but a routing hint toward the ingest lane.
export type ProjectRecommendMode = 'fresh' | 'ingest' | 'spernakit';

export interface ProjectCreateSpecInputDto {
	kind: 'path' | 'text';
	value: string;
}

export interface ProjectCreateInputDto {
	description: null | string;
	// Optional launch-target override for the first run (or intake session) the
	// create kicks off; unset fields resolve from global config.
	launchTarget?: LaunchTargetOverrides;
	mode: ProjectCreateMode;
	name: string;
	root: string;
	spec: null | ProjectCreateSpecInputDto;
	/** Defaults to true at the create API boundary. */
	stopBeforeImplementation?: boolean;
	// Optional named template from web.templates. When set it takes precedence over mode
	// and scaffolds via that registry entry (third-party templates default to ingest).
	template?: string;
	// Optional GitHub template repo source (https URL, github.com/owner/repo, or owner/repo,
	// with an optional #ref). Mutually exclusive with template. Cloned with degit semantics
	// (shallow clone, stripped history, fresh git init), then routed to project-intake.
	templateUrl?: string;
}

export interface ProjectCreateResultDto {
	// Present when the template's postCreate is 'ingest' (the project-intake session).
	intakeSessionId: null | string;
	mode: ProjectCreateMode;
	path: string;
	projectId: string;
	// Present for fresh/coding-run creates; null when the create ended in an ingest session.
	runId: null | string;
	stopBeforeImplementation: boolean;
}

export interface ProjectImplementationFeatureDto {
	directory: string;
	id: string;
	title: string;
}

export interface ProjectImplementationStateDto {
	/**
	 * The live run or pipeline the pre-coding wording is derived from, or null when nothing relevant
	 * is executing for this project. Carried on the contract so the card can link to the work it
	 * names instead of asserting activity the client cannot check.
	 */
	activity: BlueprintSetupActivity | null;
	blueprintReady: boolean;
	firstFeature: null | ProjectImplementationFeatureDto;
	reason: null | string;
	state:
		| 'blocked'
		| 'blueprint_ready'
		| 'building'
		| 'complete'
		| 'preparing'
		| 'queued'
		| 'setup_incomplete';
}

export interface ProjectStartImplementationResultDto {
	feature: ProjectImplementationFeatureDto;
	runId: string;
}

export interface ProjectRecommendInputDto {
	name: string;
	// The lane's selected destination, when known. When the resolved target (path, or
	// root/name) already contains files, the advisor offers and may recommend ingest,
	// and never falls back to fresh.
	path?: string;
	root?: string;
	spec: ProjectCreateSpecInputDto;
}

export interface ProjectRecommendResultDto {
	mode: ProjectRecommendMode;
	reasoning: string;
}

export interface ProjectDetailDto extends ProjectSummaryDto {
	artifactCheck?: unknown;
	features: ProjectFeatureDto[];
	implementation: ProjectImplementationStateDto;
	maturityDetail: MaturityDto;
	metadata: ProjectMetadataDto;
	roadmap?: unknown;
}

export type ProjectProfileUpdateDto = ProjectAssuranceProfileInput;
