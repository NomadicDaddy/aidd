import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { Elysia } from 'elysia';
import { defaultWebConfig, type ResolvedConfig } from 'aidd-shared/config';

import type { WebContext } from '../../backend/src/context.ts';
import type { ProjectService } from '../../backend/src/services/projectService.ts';
import type { RunService } from '../../backend/src/services/runService.ts';

import { errorHandlerPlugin } from '../../backend/src/plugins/errorHandler.ts';
import { createAuditsRoutes } from '../../backend/src/routes/audits.ts';
import { AuditService } from '../../backend/src/services/auditService.ts';
import { testTempDir } from '../_helpers/temp.ts';
import { removeTempTree } from './_helpers/remove-temp-tree.ts';

let rootDir: string;

function auditsApp(root: string) {
	const auditService = new AuditService(
		{ auditsEnabled: true, web: defaultWebConfig } as unknown as ResolvedConfig,
		{} as unknown as ProjectService,
		{} as unknown as RunService,
		root,
	);
	return new Elysia()
		.use(errorHandlerPlugin)
		.use(createAuditsRoutes({ auditService } as unknown as WebContext));
}

async function getAudit(name: string): Promise<Response> {
	return await auditsApp(rootDir).handle(new Request(`http://localhost/api/v1/audits/${name}`));
}

beforeEach(async () => {
	rootDir = await testTempDir('aidd-audit-detail-');
	await mkdir(join(rootDir, 'audits'), { recursive: true });
});

afterEach(async () => {
	await removeTempTree(rootDir);
});

describe('GET /api/v1/audits/:name', () => {
	test('a well-formed name with no definition answers 404, naming it and no path', async () => {
		const response = await getAudit('NO_SUCH_AUDIT');
		const text = await response.text();

		expect(response.status).toBe(404);
		expect(JSON.parse(text)).toEqual({ error: 'Audit NO_SUCH_AUDIT has no definition.' });
		expect(text).not.toContain('ENOENT');
		expect(text).not.toContain('.md');
		expect(text).not.toContain('audits');
	});

	test('a known name answers 200 with its definition', async () => {
		await writeFile(join(rootDir, 'audits', 'KNOWN.md'), '# Known\n\nThe definition.\n');

		const response = await getAudit('KNOWN');
		const body = (await response.json()) as { definition: { content: string; name: string } };

		expect(response.status).toBe(200);
		expect(body.definition.name).toBe('KNOWN');
		expect(body.definition.content).toContain('The definition.');
	});

	test('a read failure other than a missing file still answers 500', async () => {
		await mkdir(join(rootDir, 'audits', 'UNREADABLE.md'));

		const response = await getAudit('UNREADABLE');

		expect(response.status).toBe(500);
	});
});

describe('PUT /api/v1/audits/:name', () => {
	test('a name with no definition creates it, because the route writes before it reads', async () => {
		const response = await auditsApp(rootDir).handle(
			new Request('http://localhost/api/v1/audits/NEW_AUDIT', {
				body: JSON.stringify({ content: '# New audit\n\nThe definition.' }),
				headers: { 'content-type': 'application/json' },
				method: 'PUT',
			}),
		);
		const body = (await response.json()) as { definition: { content: string } };

		expect(response.status).toBe(200);
		expect(body.definition.content).toContain('The definition.');
	});
});
