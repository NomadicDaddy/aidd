import { afterEach, describe, expect, test } from 'bun:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
	isAuditApplicableToProject,
	normalizeAuditProfileMapping,
} from '../../shared/src/contracts/audit-profile-mapping.ts';
import type { AuditProfileOverrides } from '../../shared/src/contracts/audit-profile-mapping-types.ts';
import type { ProjectAssuranceProfile } from '../../shared/src/contracts/project-profile.ts';
import { projectDependencyNames } from '../../shared/src/metadata/project-packages.ts';
import { filterApplicableAuditNames } from '../../shared/src/metadata/project-profile.ts';
import { testTempDir } from '../_helpers/temp.ts';
import { removeTempTree } from '../backend/_helpers/remove-temp-tree.ts';

const repoRoot = join(import.meta.dir, '..', '..');
const roots: string[] = [];

const mapping = normalizeAuditProfileMapping({
	requiresPackages: { react_best_practices: ['react'] },
	rules: [
		{
			audits: ['LIGHTHOUSE'],
			effect: 'disabled',
			id: 'toy-skip',
			match: { criticality: ['toy'] },
		},
	],
	version: 1,
});

const profile = {
	authMode: 'none',
	bucket: 'single_user_local',
	criticality: 'utility',
	dataSensitivity: 'none',
	deployment: 'local',
	derivesFromTemplate: 'none',
	externalIntegrations: 'none',
	hasCliBinary: 'none',
	publishesReleaseArchives: 'none',
	shipsContainerImage: 'none',
	source: 'explicit',
	updatedAt: '2026-01-01T00:00:00.000Z',
} as ProjectAssuranceProfile;

async function project(files: Record<string, unknown>): Promise<string> {
	const root = await testTempDir('aidd-audit-packages-');
	roots.push(root);
	for (const [path, manifest] of Object.entries(files)) {
		const full = join(root, path);
		await mkdir(join(full, '..'), { recursive: true });
		await writeFile(full, JSON.stringify(manifest));
	}
	return root;
}

afterEach(async () => {
	for (const root of roots.splice(0)) await removeTempTree(root);
});

describe('package-scoped audit applicability', () => {
	test('an audit that requires a package applies only where a manifest depends on it', () => {
		expect(
			isAuditApplicableToProject(
				profile,
				new Set(['react']),
				'REACT_BEST_PRACTICES',
				mapping,
			),
		).toBe(true);
		expect(
			isAuditApplicableToProject(
				profile,
				new Set(['elysia']),
				'REACT_BEST_PRACTICES',
				mapping,
			),
		).toBe(false);
		// Audit names are matched case-insensitively, as rule audit names are.
		expect(
			isAuditApplicableToProject(profile, new Set(), 'react_best_practices', mapping),
		).toBe(false);
		// An audit with no package requirement is unaffected.
		expect(isAuditApplicableToProject(profile, new Set(), 'SECURITY', mapping)).toBe(true);
	});

	test('an explicit required override beats a missing package', () => {
		const overrides: AuditProfileOverrides = {
			audits: { REACT_BEST_PRACTICES: 'required' },
			rules: [],
			updatedAt: '2026-01-01T00:00:00.000Z',
			version: 1,
		};
		expect(
			isAuditApplicableToProject(
				profile,
				new Set(),
				'REACT_BEST_PRACTICES',
				mapping,
				overrides,
			),
		).toBe(true);
	});

	test('a profile rule that disables an audit still wins when the package is present', () => {
		const toy = { ...profile, criticality: 'toy' } as ProjectAssuranceProfile;
		expect(isAuditApplicableToProject(toy, new Set(['react']), 'LIGHTHOUSE', mapping)).toBe(
			false,
		);
	});

	test('the mapping rejects a requirement that names no package', () => {
		expect(() =>
			normalizeAuditProfileMapping({
				requiresPackages: { CONVEX: [] },
				rules: [],
				version: 1,
			}),
		).toThrow('must name at least one package');
	});

	test('dependency names include a frontend outside the declared workspaces', async () => {
		const dir = await project({
			'frontend/package.json': { dependencies: { react: '19.0.0' } },
			'node_modules/other/package.json': { dependencies: { convex: '1.0.0' } },
			'package.json': { devDependencies: { typescript: '6.0.3' } },
			'vendor/a/b/c/package.json': { dependencies: { vue: '3.0.0' } },
		});
		const names = await projectDependencyNames(dir);
		expect(names.has('react')).toBe(true);
		expect(names.has('typescript')).toBe(true);
		// node_modules and trees deeper than two levels are not the project's own code.
		expect(names.has('convex')).toBe(false);
		expect(names.has('vue')).toBe(false);
	});

	test('audit-all skips the template and React audits for a plain Bun project', async () => {
		const dir = await project({ 'package.json': { devDependencies: { typescript: '6.0.3' } } });
		const applicable = await filterApplicableAuditNames(repoRoot, dir, [
			'REACT_BEST_PRACTICES',
			'COMPOSITION_PATTERNS',
			'SPERNAKIT',
			'SECURITY',
		]);
		expect(applicable).toEqual(['SECURITY']);
	});

	test('audit-all keeps the React audits when a nested frontend uses React', async () => {
		const dir = await project({
			'frontend/package.json': { dependencies: { react: '19.0.0' } },
			'package.json': { devDependencies: { typescript: '6.0.3' } },
		});
		const applicable = await filterApplicableAuditNames(repoRoot, dir, [
			'REACT_BEST_PRACTICES',
			'COMPOSITION_PATTERNS',
			'SPERNAKIT',
		]);
		expect(applicable).toEqual(['REACT_BEST_PRACTICES', 'COMPOSITION_PATTERNS']);
	});
});
