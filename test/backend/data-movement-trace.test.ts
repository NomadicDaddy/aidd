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
	const providerToken = 'sk-ABCDEFGHIJKLMNOPQ';

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

	test('scrubs provider tokens from error response trace previews', async () => {
		const message = `provider rejected ${providerToken}`;
		const app = new Elysia().use(dataMovementTracePlugin).get('/api/v1/trace-error', () => {
			throw new Error(message);
		});

		const response = await app.handle(
			new Request('http://localhost/api/v1/trace-error', {
				headers: { 'X-AIDD-Trace-Enabled': '1' },
			}),
		);
		const header = response.headers.get('X-AIDD-Data-Trace') ?? '';
		const parsed = JSON.parse(header) as {
			events: { operation: string; summary?: Record<string, unknown> }[];
		};
		const errorEvent = parsed.events.find((event) => event.operation === 'api.error');

		expect(response.status).toBe(500);
		expect(header.length).toBeLessThan(7000);
		expect(header).not.toContain(providerToken);
		expect(errorEvent?.summary?.message).toEqual({
			length: message.length,
			preview: 'provider rejected [REDACTED]',
			type: 'string',
		});
	});

	test('scrubs provider tokens from neutral string previews and identifiers', () => {
		const urlPrefix = `https://provider.example/callback?state=${'x'.repeat(60)}&api_key=`;
		const url = `${urlPrefix}${providerToken}`;
		const featureId = `feature-${providerToken}`;
		beginDataMovementTrace('trace-values');
		recordDataMovement({
			category: 'event',
			operation: 'neutral.summary',
			summary: {
				location: url,
				resource: { featureId },
			},
		});

		const header = dataMovementTraceHeader();
		const parsed = JSON.parse(header) as {
			events: { operation: string; summary?: Record<string, unknown> }[];
		};
		const event = parsed.events.find((candidate) => candidate.operation === 'neutral.summary');

		expect(header.length).toBeLessThan(7000);
		expect(header).not.toContain(providerToken);
		expect(event?.summary?.location).toEqual({
			length: url.length,
			preview: `${urlPrefix}[REDACTED]`,
			type: 'string',
		});
		expect(event?.summary?.resource).toMatchObject({
			featureId: 'feature-[REDACTED]',
		});
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
