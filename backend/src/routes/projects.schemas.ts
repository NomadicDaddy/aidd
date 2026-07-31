import {
	projectAssuranceBuckets,
	projectAuthModeValues,
	projectCriticalityValues,
	projectDataSensitivityValues,
	projectDeploymentValues,
	projectExternalIntegrationValues,
	projectProfileNotesMaxLength,
} from 'aidd-shared';
import { t } from 'elysia';

import { commitMessageMaxLength } from '../services/git/workingTreeCommit.ts';
import { maxSelectedPaths } from '../services/git/workingTreeSelection.ts';
import { projectNotesMaxLength } from '../services/project/notes.ts';
import { backendNameBody } from './schemas/backend.ts';

export const projectIdParams = t.Object({ id: t.String() });
export const projectFeatureParams = t.Object({ featureId: t.String(), id: t.String() });
export const projectCommitParams = t.Object({
	id: t.String(),
	sha: t.String({ pattern: '^[0-9a-fA-F]{7,40}$' }),
});
export const projectFileQuery = t.Object({
	path: t.String({ maxLength: 512, minLength: 1 }),
});
export const projectCodeFileQuery = t.Object({
	path: t.String({ maxLength: 1000, minLength: 1 }),
});
export const projectNotesBody = t.Object({
	content: t.String({ maxLength: projectNotesMaxLength }),
});

// Working-tree paths are repository-relative and are additionally matched against the live
// `git status` listing before any command runs (see git/workingTreeSelection.ts), so the schema
// only has to bound size here.
const workingTreePaths = t.Array(t.String({ maxLength: 1000, minLength: 1 }), {
	maxItems: maxSelectedPaths,
	minItems: 1,
});
const commitMessageField = t.String({ maxLength: commitMessageMaxLength, minLength: 1 });

export const workingTreePathsBody = t.Object({ paths: workingTreePaths });
export const workingTreeCommitBody = t.Object({
	message: commitMessageField,
	paths: workingTreePaths,
});
export const workingTreeCommitStagedBody = t.Object({ message: commitMessageField });

const literal = (value: string) => t.Literal(value);
type LiteralSchema = ReturnType<typeof literal>;

function literalUnion(values: readonly string[]) {
	return t.Union(
		values.map((value) => literal(value)) as [LiteralSchema, LiteralSchema, ...LiteralSchema[]],
	);
}

export const projectProfileBody = t.Object({
	authMode: literalUnion(projectAuthModeValues),
	bucket: literalUnion(projectAssuranceBuckets),
	criticality: literalUnion(projectCriticalityValues),
	dataSensitivity: literalUnion(projectDataSensitivityValues),
	deployment: literalUnion(projectDeploymentValues),
	externalIntegrations: literalUnion(projectExternalIntegrationValues),
	notes: t.Optional(t.String({ maxLength: projectProfileNotesMaxLength })),
});

export const projectProfilePreviewsBody = t.Object({
	profiles: t.Array(
		t.Object({
			profile: projectProfileBody,
			projectId: t.String({ maxLength: 1000, minLength: 1 }),
		}),
		{ maxItems: 500 },
	),
});

export const featureApprovalBody = t.Object({
	decision: t.Optional(t.String({ maxLength: 5000 })),
	decisionRequired: t.Boolean(),
});

export const featureStatusBody = t.Object({
	status: t.Union([
		t.Literal('backlog'),
		t.Literal('completed'),
		t.Literal('in_progress'),
		t.Literal('waiting_approval'),
	]),
});

export const featureMilestoneBody = t.Object({
	milestone: t.String({ maxLength: 200, minLength: 1 }),
});

export const projectMilestoneParams = t.Object({ id: t.String(), name: t.String() });

const milestoneNameField = t.String({ maxLength: 200, minLength: 1 });
const milestoneDescriptionField = t.String({ maxLength: 2000 });
// 1-based slot in the ordered milestone list; priorities are renormalized to 1..N on every write.
const milestonePositionField = t.Integer({ minimum: 1 });
// In the body rather than the query: Elysia query booleans have to be string-literal unions.
const milestoneDryRunField = t.Optional(t.Boolean());

export const milestoneCreateBody = t.Object({
	description: t.Optional(milestoneDescriptionField),
	dryRun: milestoneDryRunField,
	name: milestoneNameField,
	position: t.Optional(milestonePositionField),
});

export const milestoneUpdateBody = t.Object({
	description: t.Optional(milestoneDescriptionField),
	dryRun: milestoneDryRunField,
	name: t.Optional(milestoneNameField),
	position: t.Optional(milestonePositionField),
});

export const milestoneDeleteBody = t.Object({
	dryRun: milestoneDryRunField,
	targetMilestone: t.Optional(milestoneNameField),
});

export const milestoneReassignBody = t.Object({ dryRun: milestoneDryRunField });

export const featureMetadataBody = t.Object({
	notes: t.Optional(t.Array(t.String({ maxLength: 5000 }), { maxItems: 100 })),
	spec: t.Optional(t.String({ maxLength: 65536 })),
});

export const projectDeleteBody = t.Object({
	confirmation: t.String({ maxLength: 1000, minLength: 1 }),
	mode: t.Union([t.Literal('directory'), t.Literal('metadata')]),
});

export const projectMoveBody = t.Object({
	destinationName: t.Optional(t.String({ maxLength: 255 })),
	destinationRoot: t.String({ maxLength: 1000, minLength: 1 }),
});

export const projectIntakePreviewQuery = t.Object({
	path: t.String({ maxLength: 1000, minLength: 1 }),
});

export const projectInitFailureParams = t.Object({ fid: t.String() });

export const projectImportBody = t.Object({
	action: t.Optional(t.Union([t.Literal('ingest'), t.Literal('register')])),
	candidateIds: t.Array(t.String({ maxLength: 1000, minLength: 1 }), { minItems: 1 }),
});

const projectCreateSpecBody = t.Object({
	kind: t.Union([t.Literal('path'), t.Literal('text')]),
	value: t.String({ maxLength: 65536, minLength: 0 }),
});

export const projectCreateBody = t.Object({
	// Optional launch-target override for the first run/intake session.
	backend: t.Optional(backendNameBody),
	description: t.Optional(t.String({ maxLength: 500, minLength: 0 })),
	mode: t.Union([t.Literal('fresh'), t.Literal('spernakit')]),
	model: t.Optional(t.String({ maxLength: 200, pattern: '^[A-Za-z0-9._:/@-]+$' })),
	name: t.String({ maxLength: 100, minLength: 1 }),
	reasoningEffort: t.Optional(t.String({ maxLength: 20, pattern: '^[A-Za-z-]+$' })),
	root: t.String({ maxLength: 1000, minLength: 1 }),
	spec: t.Optional(t.Union([projectCreateSpecBody, t.Null()])),
	stopBeforeImplementation: t.Optional(t.Boolean()),
	template: t.Optional(t.String({ maxLength: 100, minLength: 1 })),
	templateUrl: t.Optional(t.String({ maxLength: 300, minLength: 1 })),
});

export const projectStartImplementationBody = t.Object({
	backend: t.Optional(backendNameBody),
	model: t.Optional(t.String({ maxLength: 200, pattern: '^[A-Za-z0-9._:/@-]+$' })),
	reasoningEffort: t.Optional(t.String({ maxLength: 20, pattern: '^[A-Za-z-]+$' })),
});

export const projectRecommendBody = t.Object({
	name: t.String({ maxLength: 100, minLength: 1 }),
	path: t.Optional(t.String({ maxLength: 1000 })),
	root: t.Optional(t.String({ maxLength: 1000 })),
	spec: projectCreateSpecBody,
});

const reportMetadataBody = t.Object({
	pathname: t.Optional(t.String()),
	url: t.Optional(t.String()),
	userAgent: t.Optional(t.String()),
	viewport: t.Optional(
		t.Object({
			height: t.Number(),
			width: t.Number(),
		}),
	),
});

export const projectReportBody = t.Object({
	description: t.String({ maxLength: 5000, minLength: 1 }),
	kind: t.Union([t.Literal('bug'), t.Literal('feature')]),
	metadata: t.Optional(reportMetadataBody),
});

export const interviewResponseBody = t.Object({
	answer: t.String({ minLength: 1 }),
	questionId: t.String({ minLength: 1 }),
});
