import { describe, expect, test } from 'bun:test';
import { createTelemetryRoutes } from '../../backend/src/routes/telemetry.ts';
import type { WebContext } from '../../backend/src/context.ts';

describe('web telemetry routes', () => {
	test('accept run telemetry filters exposed by the Telemetry page', async () => {
		const app = createTelemetryRoutes({
			telemetryService: {
				getBackendUsage: async () => [],
				getOutputTimeseries: async () => [],
				getResourceDetail: async () => null,
				getResourceUsage: async () => [],
				getTimeseries: async () => [],
				getTopUsed: async () => [],
				listInvocations: async () => [],
			},
		} as unknown as WebContext);
		for (const path of [
			'/api/v1/telemetry/resources?type=run&windowMs=604800000',
			'/api/v1/telemetry/top?limit=10&type=run&windowMs=604800000',
			'/api/v1/telemetry/backends?type=run&windowMs=604800000',
			'/api/v1/telemetry/timeseries?bucket=day&type=run&windowMs=604800000',
			'/api/v1/telemetry/timeseries?bucket=day&type=run',
			'/api/v1/telemetry/output-timeseries?bucket=day&windowMs=604800000',
			'/api/v1/telemetry/output-timeseries?bucket=day',
			'/api/v1/telemetry/invocations?limit=50&type=run&windowMs=604800000',
		]) {
			const response = await app.handle(new Request(`http://localhost${path}`));
			expect(response.status).toBe(200);
		}
	});

	test('accept all telemetry time-window sizes (24h, 7d, 30d)', async () => {
		const app = createTelemetryRoutes({
			telemetryService: {
				getBackendUsage: async () => [],
				getOutputTimeseries: async () => [],
				getResourceDetail: async () => null,
				getResourceUsage: async () => [],
				getTimeseries: async () => [],
				getTopUsed: async () => [],
				listInvocations: async () => [],
			},
		} as unknown as WebContext);
		for (const windowMs of [86_400_000, 604_800_000, 2_592_000_000]) {
			const response = await app.handle(
				new Request(`http://localhost/api/v1/telemetry/resources?windowMs=${windowMs}`)
			);
			expect(response.status).toBe(200);
		}
	});
});
