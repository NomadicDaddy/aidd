import type { FindingDismissalReason } from 'aidd-shared/contracts/finding-dispositions';

import { Elysia } from 'elysia';

import type { WebContext } from '../context.ts';

import {
	featureApprovalBody,
	featureDismissalBody,
	featureMetadataBody,
	featureMilestoneBody,
	featureStatusBody,
	projectFeatureParams,
} from './projects.schemas.ts';

// Per-feature mutation routes, split out of projects.ts to keep each route module cohesive and
// under the file-size budget. Mounted as a sibling plugin in server.ts under the same prefix.
export function createProjectFeatureRoutes(context: WebContext) {
	return (
		new Elysia({ prefix: '/api/v1/projects' })
			// The project-detail listing returns feature summaries; this is where the prose lives.
			.get(
				'/:id/features/:featureId',
				async ({ params }) => ({
					feature: await context.projectService.features.readFeature(
						params.id,
						params.featureId,
					),
				}),
				{
					params: projectFeatureParams,
				},
			)
			.put(
				'/:id/features/:featureId/status',
				async ({ body, params }) => ({
					feature: await context.projectService.features.updateFeatureStatus(
						params.id,
						params.featureId,
						body.status,
					),
				}),
				{
					body: featureStatusBody,
					params: projectFeatureParams,
				},
			)
			.put(
				'/:id/features/:featureId/milestone',
				async ({ body, params }) =>
					await context.projectService.features.updateFeatureMilestone(
						params.id,
						params.featureId,
						body.milestone,
					),
				{
					body: featureMilestoneBody,
					params: projectFeatureParams,
				},
			)
			.patch(
				'/:id/features/:featureId/metadata',
				async ({ body, params }) => ({
					feature: await context.projectService.features.updateFeatureMetadata(
						params.id,
						params.featureId,
						body,
					),
				}),
				{
					body: featureMetadataBody,
					params: projectFeatureParams,
				},
			)
			.post(
				'/:id/features/:featureId/approval',
				async ({ body, params }) => ({
					feature: await context.projectService.features.approveFeature(
						params.id,
						params.featureId,
						{
							decision: body.decision?.trim() || null,
							decisionRequired: body.decisionRequired,
						},
					),
				}),
				{
					body: featureApprovalBody,
					params: projectFeatureParams,
				},
			)
			.post(
				'/:id/features/:featureId/dismissal',
				async ({ body, params }) => ({
					dismissed: await context.projectService.features.dismissFeature(
						params.id,
						params.featureId,
						{
							...(body.note?.trim() ? { note: body.note.trim() } : {}),
							reason: body.reason as FindingDismissalReason,
						},
					),
				}),
				{
					body: featureDismissalBody,
					params: projectFeatureParams,
				},
			)
			.delete(
				'/:id/features/:featureId',
				async ({ params }) => ({
					deleted: await context.projectService.features.deleteFeature(
						params.id,
						params.featureId,
					),
				}),
				{
					params: projectFeatureParams,
				},
			)
	);
}
