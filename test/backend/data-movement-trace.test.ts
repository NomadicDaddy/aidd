import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { Elysia } from 'elysia';
import { dataMovementTracePlugin } from '../../backend/src/plugins/dataMovementTrace.ts';
import { securityHeadersPlugin } from '../../backend/src/plugins/securityHeaders.ts';
import {
	beginDataMovementTrace,
	dataMovementTraceHeader,
	recordDataMovement,
	safeTraceTarget,
} from '../../backend/src/services/dataMovementTrace.ts';
import { readJsonOrNull, readTextOrNull } from '../../backend/src/services/fsHelpers.ts';

import { testTempDir } from '../_helpers/temp.ts';
describe('backend data movement trace', () => {
	test('adds a data trace response header for opted-in API requests', async () => {
		const app = new Elysia()
			.use(securityHeadersPlugin)
			.use(dataMovementTracePlugin)
			.get('/api/v1/trace-test', () => ({ ok: true }));

		const response = await app.handle(
			new Request('http://localhost/api/v1/trace-test', {
				headers: {
					'X-AIDD-Trace-Enabled': '1',
					'X-AIDD-Trace-ID': 'frontend-trace',
				},
			}),
		);
		const header = response.headers.get('X-AIDD-Data-Trace');
		expect(response.status).toBe(200);
		expect(typeof header).toBe('string');
		expect(JSON.parse(header ?? '{}')).toMatchObject({ traceId: 'frontend-trace' });
	});

	test('omits data trace response headers unless requested', async () => {
		const app = new Elysia()
			.use(securityHeadersPlugin)
			.use(dataMovementTracePlugin)
			.get('/api/v1/trace-test', () => ({ ok: true }));

		const response = await app.handle(new Request('http://localhost/api/v1/trace-test'));

		expect(response.status).toBe(200);
		expect(response.headers.get('X-AIDD-Data-Trace')).toBeNull();
	});

	test('collects file metadata reads into a bounded redacted header', async () => {
		const workspace = await testTempDir('aidd-trace-secret-root-');
		const metadataDir = join(workspace, 'demo', '.aidd');
		const featureDir = join(metadataDir, 'features', 'feature-secret-token');
		await mkdir(featureDir, { recursive: true });
		const featurePath = join(featureDir, 'feature.json');
		await Bun.write(
			featurePath,
			JSON.stringify({
				id: 'feature-secret-token',
				password: 'do-not-log',
				status: 'backlog',
			}),
		);

		beginDataMovementTrace('trace-test');
		await readTextOrNull(featurePath);
		await readJsonOrNull<Record<string, unknown>>(featurePath);
		recordDataMovement({
			category: 'metadata',
			operation: 'sensitive.summary',
			summary: { password: 'do-not-log', token: 'do-not-log-either' },
			target: featurePath,
		});
		const header = dataMovementTraceHeader();
		const parsed = JSON.parse(header) as {
			counts: Record<string, number>;
			events: { target?: string }[];
			traceId: string;
			truncated: boolean;
		};

		expect(parsed.traceId).toBe('trace-test');
		expect(parsed.counts.file).toBeGreaterThan(0);
		expect(parsed.counts.metadata).toBeGreaterThan(0);
		expect(header.length).toBeLessThan(7000);
		expect(header).toContain('.aidd/features/<feature>/feature.json');
		expect(header).toContain('[redacted]');
		expect(header).not.toContain(workspace.replaceAll('\\', '/'));
		expect(header).not.toContain('do-not-log');
	});

	test('does not expose absolute paths in trace targets', () => {
		expect(safeTraceTarget('D:\\applications\\demo\\.aidd\\runs.jsonl')).toBe(
			'.aidd/runs.jsonl',
		);
		expect(safeTraceTarget('D:\\applications\\demo\\package.json')).toBe('package.json');
		expect(safeTraceTarget('http://localhost/api/v1/projects')).toBe('/api/v1/projects');
	});
});
