import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';

import type { WebContext } from '../../backend/src/context.ts';

import { createProjectNotesRoutes } from '../../backend/src/routes/projectNotes.ts';
import { readProjectNotes, writeProjectNotes } from '../../backend/src/services/project/notes.ts';
import { removeTempTree } from './_helpers/remove-temp-tree.ts';

import { testTempDir } from '../_helpers/temp.ts';
const BASE = 'http://127.0.0.1:3210/api/v1';
const tempRoots: string[] = [];

async function makeProjectDir(): Promise<string> {
	const dir = await testTempDir('aidd-notes-');
	tempRoots.push(dir);
	return dir;
}

function createApp(projectDir: string) {
	const context = {
		projectService: {
			resolveDiscoveredProject: () => Promise.resolve(projectDir),
		},
	} as unknown as WebContext;
	return createProjectNotesRoutes(context);
}

afterEach(async () => {
	while (tempRoots.length > 0) {
		const dir = tempRoots.pop();
		if (dir) await removeTempTree(dir);
	}
});

describe('project notes service', () => {
	test('reads an empty pad when notes.md is absent', async () => {
		const dir = await makeProjectDir();
		expect(await readProjectNotes(dir)).toEqual({ content: '', updatedAt: null });
	});

	test('writes then reads back the persisted content and mtime', async () => {
		const dir = await makeProjectDir();
		const written = await writeProjectNotes(dir, '# Scratch\n\n- one\n');
		expect(written.content).toBe('# Scratch\n\n- one\n');
		expect(typeof written.updatedAt).toBe('number');
		const onDisk = await readFile(join(dir, '.aidd', 'notes.md'), 'utf8');
		expect(onDisk).toBe('# Scratch\n\n- one\n');
		expect((await readProjectNotes(dir)).content).toBe('# Scratch\n\n- one\n');
	});

	test('reads a pre-existing notes.md written outside the service', async () => {
		const dir = await makeProjectDir();
		await mkdir(join(dir, '.aidd'), { recursive: true });
		await writeFile(join(dir, '.aidd', 'notes.md'), 'hand-edited', 'utf8');
		expect((await readProjectNotes(dir)).content).toBe('hand-edited');
	});
});

describe('project notes routes', () => {
	test('GET returns an empty pad and PUT round-trips content', async () => {
		const dir = await makeProjectDir();
		const app = createApp(dir);

		const initial = await app.handle(new Request(`${BASE}/projects/anything/notes`));
		expect(initial.status).toBe(200);
		expect(await initial.json()).toEqual({ content: '', updatedAt: null });

		const put = await app.handle(
			new Request(`${BASE}/projects/anything/notes`, {
				body: JSON.stringify({ content: 'persisted note' }),
				headers: { 'content-type': 'application/json' },
				method: 'PUT',
			}),
		);
		expect(put.status).toBe(200);
		expect(((await put.json()) as { content: string }).content).toBe('persisted note');

		const after = await app.handle(new Request(`${BASE}/projects/anything/notes`));
		expect(((await after.json()) as { content: string }).content).toBe('persisted note');
	});

	test('PUT rejects a missing content body', async () => {
		const dir = await makeProjectDir();
		const app = createApp(dir);
		const response = await app.handle(
			new Request(`${BASE}/projects/anything/notes`, {
				body: JSON.stringify({}),
				headers: { 'content-type': 'application/json' },
				method: 'PUT',
			}),
		);
		expect(response.status).toBe(422);
	});
});
