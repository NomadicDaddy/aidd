import { afterEach, describe, expect, test } from 'bun:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { isAuditApplicableToProject } from '../../shared/src/contracts/audit-profile-mapping.ts';
import { removeTempTree } from '../../shared/src/lib/remove-temp-tree.ts';
import { loadAuditProfileMapping } from '../../shared/src/metadata/audit-profile-mapping.ts';
import {
	filterApplicableAuditNames,
	readProjectAssuranceProfile,
} from '../../shared/src/metadata/project-profile.ts';
import { readProjectAuditEvidence } from '../../shared/src/metadata/project-surfaces.ts';
import { discoverAuditNames } from '../../shared/src/modes/audit-shared.ts';
import { testTempDir } from '../_helpers/temp.ts';

// The shipped audits/audit-profile-mapping.json, end to end: which audits a whole project is
// given, read from its tree the way a run reads it.
const repoRoot = join(import.meta.dir, '..', '..');
const roots: string[] = [];

const SURFACE_AUDITS = [
	'DATABASE',
	'FRONTEND',
	'LIGHTHOUSE',
	'SCHEMA_CONSTRAINTS',
	'WEB_DESIGN_GUIDELINES',
];

// A profile no seeded rule disables any of the five for, so the surface is what decides.
const profile = {
	authMode: 'login',
	bucket: 'multi_user_local',
	criticality: 'operational',
	dataSensitivity: 'personal',
	deployment: 'private_server',
	derivesFromTemplate: 'none',
	externalIntegrations: 'none',
	hasCliBinary: 'none',
	publishesReleaseArchives: 'none',
	shipsContainerImage: 'none',
	source: 'explicit',
	updatedAt: '2026-01-01T00:00:00.000Z',
};

async function fixture(prefix: string, files: Record<string, unknown>): Promise<string> {
	const root = await testTempDir(prefix);
	roots.push(root);
	const all = { '.aidd/project-profile.json': profile, ...files };
	for (const [path, content] of Object.entries(all)) {
		const full = join(root, path);
		await mkdir(dirname(full), { recursive: true });
		await writeFile(full, typeof content === 'string' ? content : JSON.stringify(content));
	}
	return root;
}

// What the catalogue selected before it tested for surfaces: the same mapping without the two
// surface blocks, through the same resolver.
async function applicableBeforeSurfaces(dir: string, names: string[]): Promise<string[]> {
	const before = { ...(await loadAuditProfileMapping(repoRoot)) };
	delete before.requiresSurface;
	delete before.surfaces;
	const [projectProfile, evidence] = await Promise.all([
		readProjectAssuranceProfile(dir),
		readProjectAuditEvidence(dir, before),
	]);
	return names.filter((name) =>
		isAuditApplicableToProject(projectProfile, evidence, name, before),
	);
}

afterEach(async () => {
	for (const root of roots.splice(0)) await removeTempTree(root);
});

describe('surface audits in the shipped catalogue', () => {
	test('a command-line tool loses exactly the five surface audits', async () => {
		const dir = await fixture('aidd-fixture-cli-', {
			// Neither is a surface: a page under docs/ is not served by the tool, and opening a
			// database with the built-in driver is not owning one.
			'docs/index.html': '<!doctype html>',
			'package.json': {
				bin: { 'fixture-cli': 'src/cli.ts' },
				devDependencies: { typescript: '6.0.3' },
			},
			'src/cli.ts': "import { Database } from 'bun:sqlite';\n",
		});
		const names = await discoverAuditNames(repoRoot);
		const before = await applicableBeforeSurfaces(dir, names);
		const after = await filterApplicableAuditNames(repoRoot, dir, names);
		expect(before.filter((name) => !after.includes(name)).sort()).toEqual(SURFACE_AUDITS);
		expect(after.filter((name) => !before.includes(name))).toEqual([]);
	});

	test('a web application with a database keeps all five', async () => {
		const dir = await fixture('aidd-fixture-web-', {
			'backend/drizzle/0000_first.sql': '',
			'backend/package.json': { dependencies: { 'drizzle-orm': '1.0.0' } },
			'frontend/index.html': '<!doctype html>',
			'frontend/package.json': { dependencies: { react: '19.0.0', vite: '7.0.0' } },
			'package.json': { workspaces: ['backend', 'frontend'] },
		});
		const names = await discoverAuditNames(repoRoot);
		const before = await applicableBeforeSurfaces(dir, names);
		const after = await filterApplicableAuditNames(repoRoot, dir, names);
		expect(after).toEqual(before);
		for (const audit of SURFACE_AUDITS) expect(after).toContain(audit);
	});

	// A mobile app keeps its store in an embedded database declared one directory down, with its
	// schema and migrations written in TypeScript: no SQL file, no migrations directory, and a
	// root manifest that declares nothing. Only the catalogue's package list can see it.
	test('a mobile app with an embedded database keeps the database audits', async () => {
		const dir = await fixture('aidd-fixture-mobile-', {
			'frontend/package.json': { dependencies: { 'expo-sqlite': '16.0.0' } },
			'frontend/src/db/migrations.ts': 'export const migrations = [];\n',
			'frontend/src/db/schema.ts': 'export const schema = {};\n',
			'package.json': {},
		});
		const after = await filterApplicableAuditNames(
			repoRoot,
			dir,
			await discoverAuditNames(repoRoot),
		);
		expect(after).toContain('DATABASE');
		expect(after).toContain('SCHEMA_CONSTRAINTS');
	});

	test('the catalogue requires a surface of exactly those five audits', async () => {
		const mapping = await loadAuditProfileMapping(repoRoot);
		expect(mapping.requiresSurface).toEqual({
			DATABASE: 'database',
			FRONTEND: 'web-frontend',
			LIGHTHOUSE: 'web-frontend',
			SCHEMA_CONSTRAINTS: 'database',
			WEB_DESIGN_GUIDELINES: 'web-frontend',
		});
	});
});
