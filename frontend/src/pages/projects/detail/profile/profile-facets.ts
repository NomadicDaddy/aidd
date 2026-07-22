import type {
	ProjectAssuranceBucket,
	ProjectAuthMode,
	ProjectCriticality,
	ProjectDataSensitivity,
	ProjectDeployment,
	ProjectExternalIntegrations,
} from '../../../../api/types.ts';

import {
	authModeLabels,
	authModeOptions,
	bucketLabels,
	bucketOptions,
	criticalityLabels,
	criticalityOptions,
	dataSensitivityLabels,
	dataSensitivityOptions,
	deploymentLabels,
	deploymentOptions,
	externalIntegrationLabels,
	externalIntegrationOptions,
} from '../../projects-list-shared.ts';

/** The six editable facets of a project assurance profile (everything except `notes`). */
export type FacetField =
	| 'authMode'
	| 'bucket'
	| 'criticality'
	| 'dataSensitivity'
	| 'deployment'
	| 'externalIntegrations';

export interface FacetOption<Value extends string> {
	/** Short one-line meaning, sourced from docs/reference/project-profile.md. */
	blurb: string;
	/** This value satisfies a clause of `requiresFullHardening()`. */
	hardening?: boolean;
	label: string;
	/** This value is among those permitted by `isLowExposureLocalProfile()`. */
	lowExposure?: boolean;
	value: Value;
}

export interface FacetDef<Value extends string> {
	description: string;
	field: FacetField;
	options: FacetOption<Value>[];
	title: string;
}

function option<Value extends string>(
	value: Value,
	label: string,
	blurb: string,
	flags: { hardening?: boolean; lowExposure?: boolean } = {}
): FacetOption<Value> {
	const built: FacetOption<Value> = { blurb, label, value };
	if (flags.hardening) built.hardening = true;
	if (flags.lowExposure) built.lowExposure = true;
	return built;
}

const bucketBlurbs: Record<ProjectAssuranceBucket, string> = {
	critical_regulated: 'Mission-critical and/or under regulatory obligations. Highest tier.',
	internet_single_org: "Internet-reachable but serving a single organization's users.",
	multi_user_local: 'Multiple users on a local/trusted network (household or workshop).',
	private_team: 'Used by a defined internal team, typically behind a private server.',
	prototype_archive: 'Throwaway, retired, or snapshot code not run in anger.',
	public_multi_tenant: 'Public SaaS serving many independent tenants or customers.',
	single_user_local: 'One person runs it on their own machine; no other users.',
};
const bucketHardening: ReadonlySet<ProjectAssuranceBucket> = new Set([
	'public_multi_tenant',
	'critical_regulated',
]);

const dataBlurbs: Record<ProjectDataSensitivity, string> = {
	confidential: 'Sensitive business or secret data whose disclosure would cause real harm.',
	low: 'Trivial or non-identifying data; leakage is inconsequential.',
	none: 'No meaningful data to protect.',
	personal: 'Personal data tied to individuals (PII) — names, emails, personal notes.',
	regulated: 'Data under a legal/compliance regime (health, financial, etc.).',
};

const deploymentBlurbs: Record<ProjectDeployment, string> = {
	cloud: 'Runs on managed/public cloud infrastructure.',
	lan: 'Runs on a local/private network (home or office LAN); not internet-exposed.',
	local: "Runs only on the developer/owner's own machine.",
	private_server: 'Hosted on a server but restricted to a private/internal audience.',
	public_server: 'Hosted on an internet-reachable server.',
};

const authBlurbs: Record<ProjectAuthMode, string> = {
	local_owner: 'A single implicit owner (the local OS user); no login screen.',
	login: 'Authenticated users sign in, but all are equal (no role distinctions).',
	none: 'No authentication; anyone with access can use the app.',
	rbac: 'Role-based access control; permissions vary by assigned role.',
	tenant_rbac: 'Role-based access scoped per tenant — tenant isolation plus roles.',
};

const criticalityBlurbs: Record<ProjectCriticality, string> = {
	business_critical: 'Core to the business; failure causes significant harm.',
	operational: 'Supports day-to-day operations; failure disrupts real work.',
	toy: 'Experiment or demo; failure has no consequence.',
	utility: 'Helpful tool; failure is an easily worked-around inconvenience.',
};

const integrationsBlurbs: Record<ProjectExternalIntegrations, string> = {
	financial_or_security:
		'Integrates with financial or security-sensitive systems (payments, auth, secrets).',
	none: 'No external/outbound integrations.',
	read_only: 'Reads from external systems but cannot modify them.',
	write_capable: 'Can write to or modify external systems.',
};

export const bucketFacet: FacetDef<ProjectAssuranceBucket> = {
	description: 'Overall exposure and operating model. Drives most audit applicability.',
	field: 'bucket',
	options: bucketOptions.map((value) =>
		option(value, bucketLabels[value], bucketBlurbs[value], {
			hardening: bucketHardening.has(value),
			lowExposure: value === 'single_user_local',
		})
	),
	title: 'Bucket',
};

export const dataSensitivityFacet: FacetDef<ProjectDataSensitivity> = {
	description: 'Highest expected sensitivity of the data the app handles.',
	field: 'dataSensitivity',
	options: dataSensitivityOptions.map((value) =>
		option(value, dataSensitivityLabels[value], dataBlurbs[value], {
			hardening: value === 'regulated',
			lowExposure: value === 'none' || value === 'low',
		})
	),
	title: 'Data sensitivity',
};

export const deploymentFacet: FacetDef<ProjectDeployment> = {
	description: 'Where the app is expected to run.',
	field: 'deployment',
	options: deploymentOptions.map((value) =>
		option(value, deploymentLabels[value], deploymentBlurbs[value], {
			hardening: value === 'public_server' || value === 'cloud',
			lowExposure: value === 'local',
		})
	),
	title: 'Deployment',
};

export const authModeFacet: FacetDef<ProjectAuthMode> = {
	description: 'Ownership, login, and authorization boundary.',
	field: 'authMode',
	options: authModeOptions.map((value) =>
		option(value, authModeLabels[value], authBlurbs[value])
	),
	title: 'Auth mode',
};

export const criticalityFacet: FacetDef<ProjectCriticality> = {
	description: 'Impact if the app is unavailable, wrong, or unsafe.',
	field: 'criticality',
	options: criticalityOptions.map((value) =>
		option(value, criticalityLabels[value], criticalityBlurbs[value], {
			hardening: value === 'business_critical',
			lowExposure: value === 'toy' || value === 'utility',
		})
	),
	title: 'Criticality',
};

export const externalIntegrationsFacet: FacetDef<ProjectExternalIntegrations> = {
	description: 'Risk level of outbound systems the app can read from or modify.',
	field: 'externalIntegrations',
	options: externalIntegrationOptions.map((value) =>
		option(value, externalIntegrationLabels[value], integrationsBlurbs[value], {
			hardening: value === 'financial_or_security',
			lowExposure: value === 'none' || value === 'read_only',
		})
	),
	title: 'External integrations',
};

// Order: most → least audit-impactful, matching how the facets cascade into posture.
export const profileFacets = [
	bucketFacet,
	deploymentFacet,
	dataSensitivityFacet,
	externalIntegrationsFacet,
	criticalityFacet,
	authModeFacet,
] as const;
