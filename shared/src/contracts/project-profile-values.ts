/**
 * The permitted values of every project-profile facet, and nothing else.
 *
 * Split out of `project-profile.ts` when the four carriage facets landed and the combined file
 * crossed the 300-line ceiling. The vocabularies are re-exported from there, so nothing outside
 * this directory needs to know the split happened.
 *
 * Every facet is a string enum rather than a boolean, including the two-valued one. Audit scoping
 * reads facets through `matchFacetSets`, which is a `Record<string, ReadonlySet<string>>`; a boolean
 * cannot be expressed in it at all, and a two-valued enum can grow a third value without changing
 * the type of anything that already reads it.
 */

// --- Exposure facets: what the project is and who can reach it. ---

export const projectAssuranceBuckets = [
	'prototype_archive',
	'single_user_local',
	'multi_user_local',
	'private_team',
	'internet_single_org',
	'public_multi_tenant',
	'critical_regulated',
] as const;

export const projectDataSensitivityValues = [
	'none',
	'low',
	'personal',
	'confidential',
	'regulated',
] as const;

export const projectDeploymentValues = [
	'local',
	'lan',
	'private_server',
	'public_server',
	'cloud',
] as const;

export const projectAuthModeValues = [
	'none',
	'local_owner',
	'login',
	'rbac',
	'tenant_rbac',
] as const;

export const projectCriticalityValues = [
	'toy',
	'utility',
	'operational',
	'business_critical',
] as const;

export const projectExternalIntegrationValues = [
	'none',
	'read_only',
	'write_capable',
	'financial_or_security',
] as const;

// --- Carriage facets: what the project produces and where that output goes. ---
//
// These answer "does this gate apply here" rather than "how exposed is this". They are ordered
// least to most consequential, and in every one of them `none` is the value that scopes a gate out.

/** Whether a container image is built, and whether it reaches a registry. */
export const projectContainerImageValues = ['none', 'local_only', 'published'] as const;

/** Whether the project is invoked as a command, and whether it ships a compiled artifact. */
export const projectCliBinaryValues = ['none', 'script_entry', 'packaged_binary'] as const;

/** Which template the project was scaffolded from, if any. Names the template, not a yes/no. */
export const projectTemplateOriginValues = ['none', 'spernakit'] as const;

/** What a published release carries: nothing, only what the forge attaches, or built artifacts. */
export const projectReleaseArtifactValues = ['none', 'source_only', 'binary_archives'] as const;

// --- Provenance. ---

export const projectProfileSourceValues = ['explicit', 'inferred'] as const;
export const projectProfileFileSourceValues = ['explicit'] as const;
export const projectProfileNotesMaxLength = 4000;

export type ProjectAssuranceBucket = (typeof projectAssuranceBuckets)[number];
export type ProjectAuthMode = (typeof projectAuthModeValues)[number];
export type ProjectCliBinary = (typeof projectCliBinaryValues)[number];
export type ProjectContainerImage = (typeof projectContainerImageValues)[number];
export type ProjectCriticality = (typeof projectCriticalityValues)[number];
export type ProjectDataSensitivity = (typeof projectDataSensitivityValues)[number];
export type ProjectDeployment = (typeof projectDeploymentValues)[number];
export type ProjectExternalIntegrations = (typeof projectExternalIntegrationValues)[number];
export type ProjectProfileSource = (typeof projectProfileSourceValues)[number];
export type ProjectReleaseArtifacts = (typeof projectReleaseArtifactValues)[number];
export type ProjectTemplateOrigin = (typeof projectTemplateOriginValues)[number];
