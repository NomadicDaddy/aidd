import {
	type ProjectAssuranceBucket,
	projectAssuranceBuckets,
	type ProjectAuthMode,
	projectAuthModeValues,
	type ProjectCliBinary,
	projectCliBinaryValues,
	type ProjectContainerImage,
	projectContainerImageValues,
	type ProjectCriticality,
	projectCriticalityValues,
	type ProjectDataSensitivity,
	projectDataSensitivityValues,
	type ProjectDeployment,
	projectDeploymentValues,
	type ProjectExternalIntegrations,
	projectExternalIntegrationValues,
	projectProfileFileSourceValues,
	projectProfileNotesMaxLength,
	type ProjectProfileSource,
	type ProjectReleaseArtifacts,
	projectReleaseArtifactValues,
	type ProjectTemplateOrigin,
	projectTemplateOriginValues,
} from './project-profile-values.ts';

export * from './project-profile-values.ts';

export interface ProjectAssuranceProfile {
	authMode: ProjectAuthMode;
	bucket: ProjectAssuranceBucket;
	criticality: ProjectCriticality;
	dataSensitivity: ProjectDataSensitivity;
	deployment: ProjectDeployment;
	derivesFromTemplate: ProjectTemplateOrigin;
	externalIntegrations: ProjectExternalIntegrations;
	hasCliBinary: ProjectCliBinary;
	notes?: string;
	publishesReleaseArchives: ProjectReleaseArtifacts;
	shipsContainerImage: ProjectContainerImage;
	source: ProjectProfileSource;
	updatedAt: string;
}

export interface ProjectAssuranceProfileInput {
	authMode: ProjectAuthMode;
	bucket: ProjectAssuranceBucket;
	criticality: ProjectCriticality;
	dataSensitivity: ProjectDataSensitivity;
	deployment: ProjectDeployment;
	derivesFromTemplate: ProjectTemplateOrigin;
	externalIntegrations: ProjectExternalIntegrations;
	hasCliBinary: ProjectCliBinary;
	notes?: string;
	publishesReleaseArchives: ProjectReleaseArtifacts;
	shipsContainerImage: ProjectContainerImage;
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
	readonly properties: Readonly<Record<string, JsonSchemaString>>;
	readonly required: readonly string[];
	readonly title: string;
	readonly type: 'object';
};

/**
 * The facets a profile must carry. Both schemas mark every one of them required, which is what makes
 * a profile missing a facet fail `normalizeProjectAssuranceProfileFile` rather than
 * quietly normalize to a value nobody chose — but the failure is silent one level up, since
 * `readExplicitProjectAssuranceProfile` answers a rejected file with inference. Adding a name here
 * therefore means populating every `.aidd/project-profile.json` in the same change.
 */
const projectProfileCoreFields = [
	'authMode',
	'bucket',
	'criticality',
	'dataSensitivity',
	'deployment',
	'derivesFromTemplate',
	'externalIntegrations',
	'hasCliBinary',
	'publishesReleaseArchives',
	'shipsContainerImage',
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
	derivesFromTemplate: stringEnumSchema(projectTemplateOriginValues),
	externalIntegrations: stringEnumSchema(projectExternalIntegrationValues),
	hasCliBinary: stringEnumSchema(projectCliBinaryValues),
	notes: { maxLength: projectProfileNotesMaxLength, type: 'string' },
	publishesReleaseArchives: stringEnumSchema(projectReleaseArtifactValues),
	shipsContainerImage: stringEnumSchema(projectContainerImageValues),
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
const cliBinarySet = allowedSet(projectCliBinaryValues);
const containerImageSet = allowedSet(projectContainerImageValues);
const dataSensitivitySet = allowedSet(projectDataSensitivityValues);
const deploymentSet = allowedSet(projectDeploymentValues);
const authModeSet = allowedSet(projectAuthModeValues);
const criticalitySet = allowedSet(projectCriticalityValues);
const externalIntegrationSet = allowedSet(projectExternalIntegrationValues);
const releaseArtifactSet = allowedSet(projectReleaseArtifactValues);
const templateOriginSet = allowedSet(projectTemplateOriginValues);

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
		derivesFromTemplate: enumField<ProjectTemplateOrigin>(
			raw.derivesFromTemplate,
			templateOriginSet,
			'derivesFromTemplate',
		),
		externalIntegrations: enumField<ProjectExternalIntegrations>(
			raw.externalIntegrations,
			externalIntegrationSet,
			'externalIntegrations',
		),
		hasCliBinary: enumField<ProjectCliBinary>(raw.hasCliBinary, cliBinarySet, 'hasCliBinary'),
		publishesReleaseArchives: enumField<ProjectReleaseArtifacts>(
			raw.publishesReleaseArchives,
			releaseArtifactSet,
			'publishesReleaseArchives',
		),
		shipsContainerImage: enumField<ProjectContainerImage>(
			raw.shipsContainerImage,
			containerImageSet,
			'shipsContainerImage',
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
