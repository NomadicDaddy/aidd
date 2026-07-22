import { Database } from 'bun:sqlite';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, test } from 'bun:test';

import type { ProjectService } from '../../backend/src/services/projectService.ts';

import { wrapWebDatabase, type WebDatabase } from '../../backend/src/db/client.ts';
import type { DbCommands } from '../../backend/src/db/commands.ts';
import { migrateWebDatabase } from '../../backend/src/db/migrate.ts';
import { DiaryService } from '../../backend/src/services/diaryService.ts';

import { testTempDir } from '../_helpers/temp.ts';
// Allowed-roots guard: the entries/timeline reads must funnel an incoming projectPath through
// projectService.resolveProjectPath before any filesystem scan, so a path outside the configured
// roots can never trigger a read of an arbitrary `<path>/.aidd/diary` directory.

let db: WebDatabase;
let commands: DbCommands;

beforeEach(() => {
	const sqlite = new Database(':memory:');
	migrateWebDatabase(sqlite);
	const wrapped = wrapWebDatabase(sqlite);
	db = wrapped.db;
	commands = wrapped.commands;
});

function serviceWith(allowedPath: string): DiaryService {
	const resolveCalls: string[] = [];
	const projectService = {
		listProjectListings: async () => ({ projects: [], skippedRoots: [] }),
		resolveProjectPath: async (path: string) => {
			resolveCalls.push(path);
			if (path === allowedPath) return allowedPath;
			throw new Error('Path is outside the configured allowed roots');
		},
	} as unknown as ProjectService;
	const service = new DiaryService({ commands, db, projectService, rootDir: tmpdir() });
	(service as unknown as { resolveCalls: string[] }).resolveCalls = resolveCalls;
	return service;
}

async function makeProjectWithEntry(): Promise<string> {
	const dir = await testTempDir('diary-guard-');
	const dayDir = join(dir, '.aidd', 'diary', '2026', '06');
	await mkdir(dayDir, { recursive: true });
	await writeFile(join(dayDir, '12.md'), "---\ntitle: 'Guarded'\n---\n\n# Guarded\n\nbody");
	return dir;
}

describe('DiaryService allowed-roots guard', () => {
	test('returns an empty entries page for a path outside allowed roots (no scan)', async () => {
		const service = serviceWith('d:/applications/allowed');
		const page = await service.listEntriesPage({ projectPath: '/etc' });
		expect(page).toEqual({ items: [], nextCursor: null });
	});

	test('returns an empty timeline page for a disallowed path', async () => {
		const service = serviceWith('d:/applications/allowed');
		const page = await service.listTimelinePage({ projectPath: '../../secret' });
		expect(page).toEqual({ items: [], nextCursor: null });
	});

	test('reads and indexes entries for an allowed, resolved project path', async () => {
		const dir = await makeProjectWithEntry();
		const service = serviceWith(dir);
		const page = await service.listEntriesPage({ projectPath: dir });
		expect(page.items).toHaveLength(1);
		expect(page.items[0]?.title).toBe('Guarded');
		expect(page.items[0]?.date).toBe('2026-06-12');
		expect(page.items[0]?.projectId.length).toBeGreaterThan(0);
	});
});
