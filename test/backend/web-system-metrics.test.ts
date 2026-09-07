import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { ResolvedWebConfig } from 'aidd-shared/config';
import type { WebContext } from '../../backend/src/context.ts';
import { createWebDatabase, type WebDatabaseHandle } from '../../backend/src/db/client.ts';
import { migrateWebDatabase } from '../../backend/src/db/migrate.ts';
import { createSystemRoutes } from '../../backend/src/routes/system.ts';
import { getHeapUsage } from '../../backend/src/services/metrics/metricsHelpers.ts';
import { MetricsService } from '../../backend/src/services/metricsService.ts';

import { testTempDir } from '../_helpers/temp.ts';
import { removeTempTree } from './_helpers/remove-temp-tree.ts';
function makeWeb(dataDir: string): ResolvedWebConfig {
	return {
		allowRemote: false,
		allowedOrigins: [],
		allowedRoots: [dataDir],
		dataDir,
		hostname: '127.0.0.1',
		ignoredFolders: [],
		maxConcurrentRuns: 2,
		maxConcurrentRunsPerProject: 2,
		autoChainLimit: 3,
		autoChainRuns: false,
		useWorktrees: false,
		port: 3210,
		spernakitFleetManifest: null,
		spernakitInitScript: null,
		spernakitTemplateRef: null,
		showSpernakitProject: false,
		spernakitTemplateRepo: 'NomadicDaddy/spernakit',
		templates: [],
		traceDataMovement: false,
	} as ResolvedWebConfig;
}

describe('system metrics routes (stubbed)', () => {
	test('metrics + web-vitals endpoints accept their documented query/body shapes', async () => {
		const app = createSystemRoutes({
			metricsService: {
				collectSnapshot: () => ({
					activeConnections: 0,
					cpuUsage: 1,
					diskUsage: 2,
					eventLoopLatency: 0.5,
					heapTotal: 100,
					heapUsed: 50,
					memoryUsage: 3,
					requestCount: 7,
					rss: 200,
					timestamp: 1,
				}),
				getLatestMetrics: async () => null,
				getMetricsHistory: async () => [],
				getWebVitalsSummary: async () => [],
				storeWebVitals: async () => {},
			},
		} as unknown as WebContext);

		const metricsRes = await app.handle(
			new Request('http://localhost/api/v1/system/metrics?hours=6&limit=10'),
		);
		expect(metricsRes.status).toBe(200);
		const metricsBody = (await metricsRes.json()) as { current: { requestCount: number } };
		expect(metricsBody.current.requestCount).toBe(7);

		const postRes = await app.handle(
			new Request('http://localhost/api/v1/system/web-vitals', {
				body: JSON.stringify({
					metrics: [
						{ name: 'LCP', navigationType: 'navigate', rating: 'good', value: 1200 },
					],
					url: '/projects',
				}),
				headers: { 'content-type': 'application/json' },
				method: 'POST',
			}),
		);
		expect(postRes.status).toBe(204);

		const vitalsRes = await app.handle(
			new Request('http://localhost/api/v1/system/web-vitals?hours=6'),
		);
		expect(vitalsRes.status).toBe(200);
	});
});

describe('MetricsService against a real database', () => {
	let dataDir: string;
	let handle: WebDatabaseHandle;
	let service: MetricsService;

	beforeEach(async () => {
		dataDir = await testTempDir('aidd-metrics-');
		handle = await createWebDatabase(makeWeb(dataDir));
		if (handle.sqlite) migrateWebDatabase(handle.sqlite);
		service = new MetricsService({
			dataDir,
			db: handle.db,
			getActiveConnections: () => 3,
		});
	});

	afterEach(async () => {
		await handle.close();
		await removeTempTree(dataDir);
	});

	test('stores web vitals and summarizes them by metric with thresholds', async () => {
		await service.storeWebVitals({
			metrics: [
				{ name: 'LCP', navigationType: 'navigate', rating: 'good', value: 1000 },
				{
					name: 'LCP',
					navigationType: 'navigate',
					rating: 'needs-improvement',
					value: 3000,
				},
				{ name: 'CLS', navigationType: 'navigate', rating: 'good', value: 0.02 },
			],
			url: '/runs',
		});

		const summary = await service.getWebVitalsSummary(6);
		const lcp = summary.find((entry) => entry.name === 'LCP');
		expect(lcp).toBeDefined();
		expect(lcp?.sampleCount).toBe(2);
		// Nearest rank over two samples is the second, not their mean: 3000, which is over budget.
		expect(lcp?.p75).toBe(3000);
		expect(lcp?.threshold).toBe(2500);

		const cls = summary.find((entry) => entry.name === 'CLS');
		expect(cls?.sampleCount).toBe(1);
		expect(cls?.p75).toBe(0.02);
		expect(cls?.threshold).toBe(0.1);

		// Metrics with no samples report a null percentile — an unmeasured metric is not a zero.
		const inp = summary.find((entry) => entry.name === 'INP');
		expect(inp?.sampleCount).toBe(0);
		expect(inp?.p75).toBeNull();
		expect(inp?.latest).toBeNull();
	});

	test('grades on the slow tail: a distribution whose mean passes but whose p75 does not', async () => {
		// Five fast loads and three slow ones. Mean LCP is 2125ms — inside the 2500ms budget — while
		// three eighths of the loads are over it, which is exactly what p75 exists to surface.
		const values = [400, 400, 400, 400, 400, 5000, 5000, 5000];
		await service.storeWebVitals({
			metrics: values.map((value) => ({
				name: 'LCP',
				navigationType: 'navigate',
				rating: value <= 2500 ? 'good' : 'poor',
				value,
			})),
			url: '/projects',
		});

		const lcp = (await service.getWebVitalsSummary(6)).find((entry) => entry.name === 'LCP');
		const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
		expect(mean).toBeLessThan(2500);
		expect(lcp?.sampleCount).toBe(values.length);
		expect(lcp?.p75).toBe(5000);
		expect(lcp?.p75).toBeGreaterThan(lcp?.threshold ?? 0);
	});

	test('collectSnapshot reports live process fields and active connection count', () => {
		const snapshot = service.collectSnapshot();
		expect(snapshot.activeConnections).toBe(3);
		if (snapshot.heapUsed === null || snapshot.heapTotal === null) {
			throw new Error('Bun did not provide heap statistics');
		}
		expect(snapshot.heapUsed).toBeGreaterThan(0);
		expect(snapshot.heapUsed).toBeLessThanOrEqual(snapshot.heapTotal);
		expect(snapshot.rss).toBeGreaterThan(0);
		expect(Number.isFinite(snapshot.memoryUsage)).toBe(true);
	});

	test('reports heap metrics as unavailable instead of fabricating an invalid pair', () => {
		expect(getHeapUsage(() => ({ heapCapacity: 10, heapSize: 20 }))).toEqual({
			heapTotal: null,
			heapUsed: null,
		});
		expect(
			getHeapUsage(() => {
				throw new Error('heap statistics unavailable');
			}),
		).toEqual({ heapTotal: null, heapUsed: null });
	});
});
