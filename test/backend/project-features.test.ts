import { afterEach, describe, expect, test } from 'bun:test';
import { Elysia } from 'elysia';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { WebContext } from '../../backend/src/context.ts';

import { errorHandlerPlugin } from '../../backend/src/plugins/errorHandler.ts';
import { createProjectFeatureRoutes } from '../../backend/src/routes/projectFeatures.ts';
import { ProjectFeatureService } from '../../backend/src/services/project/featureService.ts';
import { testTempDir } from '../_helpers/temp.ts';
import { removeTempTree } from './_helpers/remove-temp-tree.ts';

const BASE = 'http://127.0.0.1:3210/api/v1/projects/fixture/features';
const FINGERPRINT = `f1-${'a'.repeat(64)}`;
const tempRoots: string[] = [];

async function seedFeature(
	status: 'backlog' | 'in_progress' | 'waiting_approval',
	shape: 'fingerprint-only' | boolean = true,
): Promise<{ featureId: string; projectDir: string }> {
	const projectDir = await testTempDir('aidd-project-features-');
	tempRoots.push(projectDir);
	const featureId = shape === false ? 'plain-feature' : 'audit-security-finding';
	const featureDir = join(projectDir, '.aidd', 'features', featureId);
	await mkdir(featureDir, { recursive: true });
	await writeFile(
		join(featureDir, 'feature.json'),
		`${JSON.stringify(
			{
				...(shape === true ? { auditSource: 'SECURITY', fingerprint: FINGERPRINT } : {}),
				...(shape === 'fingerprint-only' ? { fingerprint: FINGERPRINT } : {}),
				id: featureId,
				passes: false,
				status,
				title: 'Finding',
			},
			null,
			2,
		)}\n`,
	);
	return { featureId, projectDir };
}

function createApp(projectDir: string) {
	const context = {
		projectService: {
			features: new ProjectFeatureService(() => Promise.resolve(projectDir)),
		},
	} as unknown as WebContext;
	return new Elysia().use(errorHandlerPlugin).use(createProjectFeatureRoutes(context));
}

function send(
	app: ReturnType<typeof createApp>,
	method: string,
	featureId: string,
	body?: unknown,
) {
	return app.handle(
		new Request(`${BASE}/${featureId}${method === 'POST' ? '/dismissal' : ''}`, {
			...(body === undefined ? {} : { body: JSON.stringify(body) }),
			headers: { 'content-type': 'application/json' },
			method,
		}),
	);
}

async function pathExists(path: string): Promise<boolean> {
	return stat(path).then(
		() => true,
		() => false,
	);
}

afterEach(async () => {
	while (tempRoots.length > 0) {
		const root = tempRoots.pop();
		if (root) await removeTempTree(root);
	}
});

describe('project feature dispositions', () => {
	test('POST dismissal writes the lifecycle event before removing the feature', async () => {
		const { featureId, projectDir } = await seedFeature('backlog');
		const response = await send(createApp(projectDir), 'POST', featureId, {
			note: 'Confirmed benign in the route assembly. ',
			reason: 'false-positive',
		});

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ dismissed: { id: featureId } });
		expect(await pathExists(join(projectDir, '.aidd', 'features', featureId))).toBe(false);
		const event = JSON.parse(
			(await readFile(join(projectDir, '.aidd', 'findings-ledger.jsonl'), 'utf8')).trim(),
		) as Record<string, unknown>;
		expect(event).toMatchObject({
			auditSource: 'SECURITY',
			event: 'dismissed',
			featureId,
			fingerprint: FINGERPRINT,
			note: 'Confirmed benign in the route assembly.',
			reason: 'false-positive',
			source: 'web-ui',
		});
		expect('runId' in event).toBe(false);
		expect(Number.isNaN(Date.parse(event.at as string))).toBe(false);
	});

	test('a retried dismissal after a failed removal appends no second event', async () => {
		const { featureId, projectDir } = await seedFeature('backlog');
		// The first attempt recorded the event and then failed to remove the directory.
		const recorded = JSON.stringify({
			at: '2026-08-25T10:00:00.000Z',
			auditSource: 'SECURITY',
			event: 'dismissed',
			featureId,
			fingerprint: FINGERPRINT,
			reason: 'not-worth-it',
			source: 'web-ui',
		});
		await writeFile(join(projectDir, '.aidd', 'findings-ledger.jsonl'), `${recorded}\n`);

		const response = await send(createApp(projectDir), 'POST', featureId, {
			reason: 'not-worth-it',
		});

		expect(response.status).toBe(200);
		expect(await pathExists(join(projectDir, '.aidd', 'features', featureId))).toBe(false);
		const raw = await readFile(join(projectDir, '.aidd', 'findings-ledger.jsonl'), 'utf8');
		expect(raw.trim().split(/\r?\n/u)).toEqual([recorded]);
	});

	test('dismissal preserves the delete status guard and writes no event on refusal', async () => {
		const { featureId, projectDir } = await seedFeature('in_progress');
		const response = await send(createApp(projectDir), 'POST', featureId, {
			reason: 'not-worth-it',
		});

		expect(response.status).toBe(409);
		expect(await response.text()).toContain(
			'Only backlog or waiting_approval features can be deleted',
		);
		expect(await pathExists(join(projectDir, '.aidd', 'features', featureId))).toBe(true);
		expect(await pathExists(join(projectDir, '.aidd', 'findings-ledger.jsonl'))).toBe(false);
	});

	test('dismissal leaves the feature intact when the ledger append fails', async () => {
		const { featureId, projectDir } = await seedFeature('backlog');
		await mkdir(join(projectDir, '.aidd', 'findings-ledger.jsonl'));
		const service = new ProjectFeatureService(() => Promise.resolve(projectDir));

		await expect(
			service.dismissFeature('fixture', featureId, { reason: 'other' }),
		).rejects.toBeInstanceOf(Error);
		expect(await pathExists(join(projectDir, '.aidd', 'features', featureId))).toBe(true);
	});

	test('bare DELETE refuses fingerprinted findings and names the dismissal route', async () => {
		const { featureId, projectDir } = await seedFeature('waiting_approval');
		const response = await send(createApp(projectDir), 'DELETE', featureId);

		expect(response.status).toBe(409);
		expect(await response.text()).toContain('POST /features/:featureId/dismissal');
		expect(await pathExists(join(projectDir, '.aidd', 'features', featureId))).toBe(true);
	});

	// A fingerprint without an auditSource must not be refused by both DELETE (it has a
	// fingerprint) and dismissal (it has no auditSource), which would leave the record unremovable.
	test('a fingerprint without an auditSource deletes as a plain feature', async () => {
		const { featureId, projectDir } = await seedFeature('backlog', 'fingerprint-only');
		const dismissal = await send(createApp(projectDir), 'POST', featureId, { reason: 'other' });
		expect(dismissal.status).toBe(409);
		expect(await pathExists(join(projectDir, '.aidd', 'findings-ledger.jsonl'))).toBe(false);

		const response = await send(createApp(projectDir), 'DELETE', featureId);

		expect(response.status).toBe(200);
		expect(await pathExists(join(projectDir, '.aidd', 'features', featureId))).toBe(false);
	});

	test('bare DELETE keeps working for features without fingerprints', async () => {
		const { featureId, projectDir } = await seedFeature('backlog', false);
		const response = await send(createApp(projectDir), 'DELETE', featureId);

		expect(response.status).toBe(200);
		expect(await pathExists(join(projectDir, '.aidd', 'features', featureId))).toBe(false);
	});

	test('dismissal rejects reasons outside the shared vocabulary', async () => {
		const { featureId, projectDir } = await seedFeature('backlog');
		const response = await send(createApp(projectDir), 'POST', featureId, {
			reason: 'because-i-said-so',
		});

		expect(response.status).toBe(400);
		expect(await pathExists(join(projectDir, '.aidd', 'features', featureId))).toBe(true);
	});
});
