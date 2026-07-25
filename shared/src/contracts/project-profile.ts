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

export const projectProfileSourceValues = ['explicit', 'inferred'] as const;
export const projectProfileFileSourceValues = ['explicit'] as const;
export const projectProfileNotesMaxLength = 4000;

export type ProjectAssuranceBucket = (typeof projectAssuranceBuckets)[number];
export type ProjectAuthMode = (typeof projectAuthModeValues)[number];
export type ProjectCriticality = (typeof projectCriticalityValues)[number];
export type ProjectDataSensitivity = (typeof projectDataSensitivityValues)[number];
export type ProjectDeployment = (typeof projectDeploymentValues)[number];
export type ProjectExternalIntegrations = (typeof projectExternalIntegrationValues)[number];
export type ProjectProfileSource = (typeof projectProfileSourceValues)[number];

export interface ProjectAssuranceProfile {
	authMode: ProjectAuthMode;
	bucket: ProjectAssuranceBucket;
	criticality: ProjectCriticality;
	dataSensitivity: ProjectDataSensitivity;
	deployment: ProjectDeployment;
	externalIntegrations: ProjectExternalIntegrations;
	notes?: string;
	source: ProjectProfileSource;
	updatedAt: string;
}

export interface ProjectAssuranceProfileInput {
	authMode: ProjectAuthMode;
	bucket: ProjectAssuranceBucket;
	criticality: ProjectCriticality;
	dataSensitivity: ProjectDataSensitivity;
	deployment: ProjectDeployment;
	externalIntegrations: ProjectExternalIntegrations;
	notes?: string;
}

type JsonSchemaString = {
	readonly enum?: readonly string[];
	readonly format?: string;
	readonly maxLength?: number;
	readonly type: 'string';
};

type ProjectAssuranceProfileSchema = {
	readonly $schema: 'https://json-schema.org/draft/2020-12/schema';
	readonly additionalProperties: false;
	readonly properties: {
		readonly authMode: JsonSchemaString;
		readonly bucket: JsonSchemaString;
		readonly criticality: JsonSchemaString;
		readonly dataSensitivity: JsonSchemaString;
		readonly deployment: JsonSchemaString;
		readonly externalIntegrations: JsonSchemaString;
		readonly notes: JsonSchemaString;
		readonly source?: JsonSchemaString;
		readonly updatedAt?: JsonSchemaString;
	};
	readonly required: readonly string[];
	readonly title: string;
	readonly type: 'object';
};

const projectProfileCoreFields = [
	'authMode',
	'bucket',
	'criticality',
	'dataSensitivity',
	'deployment',
	'externalIntegrations',
] as const;

function stringEnumSchema(values: readonly string[]): JsonSchemaString {
	return { enum: values, type: 'string' };
}

const projectAssuranceProfileCoreProperties = {
	authMode: stringEnumSchema(projectAuthModeValues),
	bucket: stringEnumSchema(projectAssuranceBuckets),
	criticality: stringEnumSchema(projectCriticalityValues),
	dataSensitivity: stringEnumSchema(projectDataSensitivityValues),
	deployment: stringEnumSchema(projectDeploymentValues),
	externalIntegrations: stringEnumSchema(projectExternalIntegrationValues),
	notes: { maxLength: projectProfileNotesMaxLength, type: 'string' },
} as const;

export const projectAssuranceProfileInputSchema = {
	$schema: 'https://json-schema.org/draft/2020-12/schema',
	additionalProperties: false,
	properties: projectAssuranceProfileCoreProperties,
	required: projectProfileCoreFields,
	title: 'aidd project assurance profile input',
	type: 'object',
} as const satisfies ProjectAssuranceProfileSchema;

export const projectAssuranceProfileFileSchema = {
	$schema: 'https://json-schema.org/draft/2020-12/schema',
	additionalProperties: false,
	properties: {
		...projectAssuranceProfileCoreProperties,
		source: stringEnumSchema(projectProfileFileSourceValues),
		updatedAt: { format: 'date-time', type: 'string' },
	},
	required: [...projectProfileCoreFields, 'source', 'updatedAt'],
	title: 'aidd .aidd/project-profile.json',
	type: 'object',
} as const satisfies ProjectAssuranceProfileSchema;

const bucketSet = allowedSet(projectAssuranceBuckets);
const dataSensitivitySet = allowedSet(projectDataSensitivityValues);
const deploymentSet = allowedSet(projectDeploymentValues);
const authModeSet = allowedSet(projectAuthModeValues);
const criticalitySet = allowedSet(projectCriticalityValues);
const externalIntegrationSet = allowedSet(projectExternalIntegrationValues);

function allowedSet(values: readonly string[]): ReadonlySet<string> {
	return new Set(values);
}

export function normalizeProjectAssuranceProfileInput(
	value: unknown,
	fallbackUpdatedAt = new Date().toISOString(),
): ProjectAssuranceProfile {
	return normalizeProjectAssuranceProfile(value, {
		fallbackUpdatedAt,
		source: 'explicit',
	});
}

export function normalizeProjectAssuranceProfileFile(value: unknown): ProjectAssuranceProfile {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new Error('Project profile must be an object.');
	}
	const raw = value as Record<string, unknown>;
	if (raw.source !== 'explicit') {
		throw new Error('Invalid project profile field: source');
	}
	if (typeof raw.updatedAt !== 'string') {
		throw new Error('Invalid project profile field: updatedAt');
	}
	return normalizeProjectAssuranceProfile(value, {
		fallbackUpdatedAt: raw.updatedAt,
		source: 'explicit',
	});
}

export function normalizeProjectAssuranceProfile(
	value: unknown,
	options: {
		fallbackUpdatedAt?: string;
		source: ProjectProfileSource;
	},
): ProjectAssuranceProfile {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new Error('Project profile must be an object.');
	}
	const raw = value as Record<string, unknown>;
	const fallbackUpdatedAt = options.fallbackUpdatedAt ?? new Date().toISOString();
	const profile: ProjectAssuranceProfile = {
		authMode: enumField<ProjectAuthMode>(raw.authMode, authModeSet, 'authMode'),
		bucket: enumField<ProjectAssuranceBucket>(raw.bucket, bucketSet, 'bucket'),
		criticality: enumField<ProjectCriticality>(raw.criticality, criticalitySet, 'criticality'),
		dataSensitivity: enumField<ProjectDataSensitivity>(
			raw.dataSensitivity,
			dataSensitivitySet,
			'dataSensitivity',
		),
		deployment: enumField<ProjectDeployment>(raw.deployment, deploymentSet, 'deployment'),
		externalIntegrations: enumField<ProjectExternalIntegrations>(
			raw.externalIntegrations,
			externalIntegrationSet,
			'externalIntegrations',
		),
		source: options.source,
		updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : fallbackUpdatedAt,
	};
	const notes = optionalNotes(raw.notes);
	if (notes !== undefined) profile.notes = notes;
	return profile;
}

function enumField<T extends string>(
	value: unknown,
	allowedValues: ReadonlySet<string>,
	field: string,
): T {
	if (typeof value !== 'string' || !allowedValues.has(value)) {
		throw new Error(`Invalid project profile field: ${field}`);
	}
	return value as T;
}

function optionalNotes(value: unknown): string | undefined {
	if (value === undefined || value === null) return undefined;
	if (typeof value !== 'string') throw new Error('Project profile notes must be a string.');
	const trimmed = value.trim().slice(0, projectProfileNotesMaxLength);
	return trimmed ? trimmed : undefined;
}
