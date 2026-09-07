import { Elysia, t } from 'elysia';

import type { WebContext } from '../context.ts';
import type { TelemetryResourceType } from '../services/telemetryService.ts';

import { HttpError } from '../services/errors.ts';

const resourceTypeSchema = t.Union([t.Literal('skill'), t.Literal('recipe'), t.Literal('run')]);

const bucketSchema = t.Union([t.Literal('day'), t.Literal('hour')]);

function asResourceType(value: string | undefined): TelemetryResourceType | undefined {
	if (value === undefined) return undefined;
	if (value !== 'skill' && value !== 'recipe' && value !== 'run') {
		throw new HttpError(`Invalid resource type: ${value}`, 400);
	}
	return value;
}

export function createTelemetryRoutes(context: WebContext) {
	return new Elysia({ prefix: '/api/v1/telemetry' })
		.get(
			'/resources',
			async ({ query }) => ({
				resources: await context.telemetryService.getResourceUsage({
					resourceType: asResourceType(query.type),
					windowMs: query.windowMs,
				}),
			}),
			{
				query: t.Object({
					type: t.Optional(t.String()),
					windowMs: t.Optional(t.Numeric({ minimum: 1 })),
				}),
			},
		)
		.get(
			'/top',
			async ({ query }) => ({
				resources: await context.telemetryService.getTopUsed({
					limit: query.limit ?? 10,
					resourceType: asResourceType(query.type),
					windowMs: query.windowMs,
				}),
			}),
			{
				query: t.Object({
					limit: t.Optional(t.Numeric({ maximum: 100, minimum: 1 })),
					type: t.Optional(t.String()),
					windowMs: t.Optional(t.Numeric({ minimum: 1 })),
				}),
			},
		)
		.get(
			'/backends',
			async ({ query }) => ({
				backends: await context.telemetryService.getBackendUsage({
					resourceType: asResourceType(query.type),
					windowMs: query.windowMs,
				}),
			}),
			{
				query: t.Object({
					type: t.Optional(t.String()),
					windowMs: t.Optional(t.Numeric({ minimum: 1 })),
				}),
			},
		)
		.get(
			'/projects',
			async ({ query }) => ({
				projects: await context.telemetryService.getProjectCosts({
					resourceType: asResourceType(query.type),
					windowMs: query.windowMs,
				}),
			}),
			{
				// `type` is accepted alongside the window the record asked for so this endpoint sees
				// exactly the invocation set the rest of the page does: with the type filter dropped, the
				// project invocation counts would stop summing to the filtered total the toolbar prints.
				query: t.Object({
					type: t.Optional(t.String()),
					windowMs: t.Optional(t.Numeric({ minimum: 1 })),
				}),
			},
		)
		.get(
			'/timeseries',
			async ({ query }) => ({
				points: await context.telemetryService.getTimeseries({
					bucket: query.bucket,
					resourceType: asResourceType(query.type),
					windowMs: query.windowMs,
				}),
			}),
			{
				query: t.Object({
					bucket: bucketSchema,
					type: t.Optional(t.String()),
					windowMs: t.Optional(t.Numeric({ minimum: 1 })),
				}),
			},
		)
		.get(
			'/output-timeseries',
			async ({ query }) => ({
				points: await context.telemetryService.getOutputTimeseries({
					bucket: query.bucket,
					windowMs: query.windowMs,
				}),
			}),
			{
				query: t.Object({
					bucket: bucketSchema,
					windowMs: t.Optional(t.Numeric({ minimum: 1 })),
				}),
			},
		)
		.get(
			'/invocations',
			async ({ query }) => ({
				invocations: await context.telemetryService.listInvocations({
					limit: query.limit ?? 50,
					resourceId: query.id,
					resourceType: asResourceType(query.type),
					windowMs: query.windowMs,
				}),
			}),
			{
				query: t.Object({
					id: t.Optional(t.String()),
					limit: t.Optional(t.Numeric({ maximum: 500, minimum: 1 })),
					type: t.Optional(t.String()),
					windowMs: t.Optional(t.Numeric({ minimum: 1 })),
				}),
			},
		)
		.get(
			'/resource/:type/:id',
			async ({ params }) => {
				const resourceType = asResourceType(params.type);
				if (resourceType === undefined) {
					throw new HttpError('Missing resource type', 400);
				}
				const detail = await context.telemetryService.getResourceDetail(
					resourceType,
					params.id,
				);
				if (!detail)
					throw new HttpError(`No telemetry for ${params.type}/${params.id}`, 404);
				return { detail };
			},
			{
				params: t.Object({
					id: t.String({ maxLength: 120, minLength: 1 }),
					type: resourceTypeSchema,
				}),
			},
		);
}
