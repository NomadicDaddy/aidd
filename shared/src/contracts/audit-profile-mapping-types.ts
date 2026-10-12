import {
	type ProjectAssuranceBucket,
	type ProjectAuthMode,
	type ProjectCliBinary,
	type ProjectContainerImage,
	type ProjectCriticality,
	type ProjectDataSensitivity,
	type ProjectDeployment,
	type ProjectExternalIntegrations,
	type ProjectReleaseArtifacts,
	type ProjectTemplateOrigin,
} from './project-profile.ts';

export const auditEffectValues = ['default', 'disabled', 'required', 'excluded'] as const;
export const auditOverrideEffectValues = ['disabled', 'required', 'excluded'] as const;
export const auditApplicabilitySources = [
	'default',
	'global-rule',
	'override-rule',
	'override-explicit',
	'missing-package',
	'missing-surface',
] as const;

/**
 * The things an audit can measure that a profile cannot record: whether a project has a web page to
 * load or a database to inspect says nothing about its exposure. Each is detected from the
 * project's tree, and the catalogue names the packages that evidence it.
 */
export const auditSurfaceValues = ['database', 'web-frontend'] as const;

export type AuditEffect = (typeof auditEffectValues)[number];
export type AuditOverrideEffect = (typeof auditOverrideEffectValues)[number];
export type AuditApplicabilitySource = (typeof auditApplicabilitySources)[number];
export type AuditSurface = (typeof auditSurfaceValues)[number];

export interface AuditSurfaceDefinition {
	/** Declaring any one of these in a project manifest is evidence the surface is present. */
	packages: string[];
}

/**
 * What one concrete project is built from, as far as applicability needs to know: the packages its
 * manifests declare, and the surfaces detected in its tree, each with the evidence that decided it
 * so a person can see why.
 */
export interface ProjectAuditEvidence {
	packages: ReadonlySet<string>;
	surfaces: ReadonlyMap<AuditSurface, string>;
	/**
	 * Surfaces counted as present only because the file scan did not finish. Their audits apply,
	 * since nothing ruled them out, but that is not the same as the thing having been found, and a
	 * screen showing applicability says so.
	 */
	undecidedSurfaces?: ReadonlySet<AuditSurface>;
}

export const auditWildcard = '*';

/**
 * A rule matches a profile when every facet it names contains the profile's value; an unnamed facet
 * is unconstrained. The carriage facets are here for the same reason as the exposure ones — a gate
 * about container images or release archives is scoped by what the project produces, not by how
 * exposed it is, and before these existed such a gate could only be scoped by a list of repository
 * names.
 */
export interface AuditProfileMatch {
	authMode?: ProjectAuthMode[];
	bucket?: ProjectAssuranceBucket[];
	criticality?: ProjectCriticality[];
	dataSensitivity?: ProjectDataSensitivity[];
	deployment?: ProjectDeployment[];
	derivesFromTemplate?: ProjectTemplateOrigin[];
	externalIntegrations?: ProjectExternalIntegrations[];
	hasCliBinary?: ProjectCliBinary[];
	publishesReleaseArchives?: ProjectReleaseArtifacts[];
	shipsContainerImage?: ProjectContainerImage[];
}

export interface AuditProfileRule {
	audits: string[];
	description?: string;
	effect: AuditOverrideEffect;
	id: string;
	match: AuditProfileMatch;
}

export interface AuditProfileMapping {
	$schema?: string;
	/**
	 * Audits that only make sense for code built on a given package, keyed by audit name. Such an
	 * audit applies to a project only where one of its manifests depends on a listed package. The
	 * profile cannot express this: whether a project uses React says nothing about its exposure.
	 */
	requiresPackages?: Record<string, string[]>;
	/**
	 * Audits that can only measure a surface, keyed by audit name. Such an audit applies to a
	 * project only where that surface is detected. Every surface named here is defined in
	 * `surfaces`.
	 */
	requiresSurface?: Record<string, AuditSurface>;
	rules: AuditProfileRule[];
	/** What counts as evidence of each surface. File evidence is decided by the detector. */
	surfaces?: Partial<Record<AuditSurface, AuditSurfaceDefinition>>;
	version: 1;
}

export interface AuditProfileOverrides {
	$schema?: string;
	audits: Record<string, AuditOverrideEffect>;
	rules: AuditProfileRule[];
	updatedAt: string;
	version: 1;
}

export interface AuditApplicabilityCell {
	applies: boolean;
	conditional?: boolean;
	effect: AuditEffect;
	/** Why the audit does not apply, when the project itself lacks what the audit measures. */
	reason?: string;
	ruleId?: string;
	source: AuditApplicabilitySource;
}

export interface AuditApplicabilityRow {
	auditName: string;
	byBucket: Record<ProjectAssuranceBucket, AuditApplicabilityCell>;
}
