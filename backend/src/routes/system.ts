import { Elysia, t } from 'elysia';

import type { WebContext } from '../context.ts';

import {
	DEFAULT_METRICS_HOURS,
	MAX_HISTORY_LIMIT,
	MAX_METRICS_HOURS,
} from '../services/metricsService.ts';

export function createSystemRoutes(context: WebContext) {
	return new Elysia({ prefix: '/api/v1/system' })
		.get(
			'/metrics',
			async ({ query }) => {
				// Defense-in-depth clamps on top of TypeBox bounds.
				const hours = Math.min(query.hours ?? DEFAULT_METRICS_HOURS, MAX_METRICS_HOURS);
				const limit = Math.min(query.limit ?? MAX_HISTORY_LIMIT, MAX_HISTORY_LIMIT);
				const [history, latest] = await Promise.all([
					context.metricsService.getMetricsHistory(hours, limit),
					context.metricsService.getLatestMetrics(),
				]);
				return {
					current: context.metricsService.collectSnapshot(),
					history,
					latest,
				};
			},
			{
				query: t.Object({
					hours: t.Optional(t.Numeric({ maximum: MAX_METRICS_HOURS, minimum: 1 })),
					limit: t.Optional(t.Numeric({ maximum: MAX_HISTORY_LIMIT, minimum: 1 })),
				}),
			}
		)
		.post(
			'/web-vitals',
			async ({ body, set }) => {
				await context.metricsService.storeWebVitals({
					metrics: body.metrics,
					url: body.url,
				});
				set.status = 204;
				return null;
			},
			{
				body: t.Object({
					metrics: t.Array(
						t.Object({
							name: t.String({ maxLength: 50 }),
							navigationType: t.String({ maxLength: 50 }),
							rating: t.String({ maxLength: 20 }),
							value: t.Number(),
						}),
						{ maxItems: 50 }
					),
					timestamp: t.Optional(t.String({ maxLength: 50 })),
					url: t.String({ maxLength: 2048 }),
				}),
			}
		)
		.get(
			'/web-vitals',
			async ({ query }) => {
				const hours = Math.min(query.hours ?? DEFAULT_METRICS_HOURS, MAX_METRICS_HOURS);
				return { vitals: await context.metricsService.getWebVitalsSummary(hours) };
			},
			{
				query: t.Object({
					hours: t.Optional(t.Numeric({ maximum: MAX_METRICS_HOURS, minimum: 1 })),
				}),
			}
		);
}
