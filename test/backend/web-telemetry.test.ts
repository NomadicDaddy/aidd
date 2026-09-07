import { describe, expect, test } from 'bun:test';
import { createTelemetryRoutes } from '../../backend/src/routes/telemetry.ts';
import type { WebContext } from '../../backend/src/context.ts';
import type { InvocationRecord } from '../../backend/src/services/telemetry/types.ts';

const scheduledInvocation: InvocationRecord = {
	argsPresent: false,
	backend: null,
	completedAt: 1_700_000_001_000,
	durationMs: 1_000,
	errorMessage: null,
	exitCode: 0,
	id: 'scheduled-invocation',
	model: null,
	parentInvocationId: null,
	parentResourceId: null,
	parentResourceName: null,
	parentResourceType: null,
	projectName: 'aidd',
	projectPath: 'D:/applications/aidd',
	resourceId: 'scheduled-skill',
	resourceName: 'Scheduled skill',
	resourceSha256: null,
	resourceType: 'skill',
	runExitCode: null,
	runId: null,
	runStatus: null,
	runStopReason: null,
	runSummary: null,
	sessionId: 'scheduled-session',
	source: 'scheduled',
	startedAt: 1_700_000_000_000,
	status: 'completed',
};

describe('web telemetry routes', () => {
	test('accept run telemetry filters exposed by the Telemetry page', async () => {
		const app = createTelemetryRoutes({
			telemetryService: {
				getBackendUsage: async () => [],
				getOutputTimeseries: async () => [],
				getProjectCosts: async () => [],
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
			'/api/v1/telemetry/projects?type=run&windowMs=604800000',
			'/api/v1/telemetry/projects',
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
				getProjectCosts: async () => [],
				getResourceDetail: async () => null,
				getResourceUsage: async () => [],
				getTimeseries: async () => [],
				getTopUsed: async () => [],
				listInvocations: async () => [],
			},
		} as unknown as WebContext);
		for (const windowMs of [86_400_000, 604_800_000, 2_592_000_000]) {
			const response = await app.handle(
				new Request(`http://localhost/api/v1/telemetry/resources?windowMs=${windowMs}`),
			);
			expect(response.status).toBe(200);
		}
	});

	test('returns scheduled invocation sources without narrowing the API record', async () => {
		const app = createTelemetryRoutes({
			telemetryService: {
				getBackendUsage: async () => [],
				getOutputTimeseries: async () => [],
				getProjectCosts: async () => [],
				getResourceDetail: async () => null,
				getResourceUsage: async () => [],
				getTimeseries: async () => [],
				getTopUsed: async () => [],
				listInvocations: async () => [scheduledInvocation],
			},
		} as unknown as WebContext);

		const response = await app.handle(
			new Request('http://localhost/api/v1/telemetry/invocations'),
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ invocations: [scheduledInvocation] });
	});

	test('serves the project cost rollup under the same filters as the rest of the page', async () => {
		const projectRow = {
			costUsd: 12.5,
			costedInvocationCount: 2,
			invocationCount: 3,
			lastInvocationAt: 1_700_000_000_000,
			projectName: 'aidd',
			projectPath: 'D:/applications/aidd',
		};
		const calls: unknown[] = [];
		const app = createTelemetryRoutes({
			telemetryService: {
				getBackendUsage: async () => [],
				getOutputTimeseries: async () => [],
				getProjectCosts: async (input: unknown) => {
					calls.push(input);
					return [projectRow];
				},
				getResourceDetail: async () => null,
				getResourceUsage: async () => [],
				getTimeseries: async () => [],
				getTopUsed: async () => [],
				listInvocations: async () => [],
			},
		} as unknown as WebContext);

		const response = await app.handle(
			new Request('http://localhost/api/v1/telemetry/projects?type=skill&windowMs=86400000'),
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ projects: [projectRow] });
		// The window and the type both reach the aggregation: dropping either would make the
		// project invocation counts stop summing to the filtered total the toolbar prints.
		expect(calls).toEqual([{ resourceType: 'skill', windowMs: 86_400_000 }]);
	});

	test('rejects a project cost request for a resource type that does not exist', async () => {
		const app = createTelemetryRoutes({
			telemetryService: { getProjectCosts: async () => [] },
		} as unknown as WebContext);

		const response = await app.handle(
			new Request('http://localhost/api/v1/telemetry/projects?type=nonsense'),
		);

		expect(response.status).toBe(400);
	});
});
