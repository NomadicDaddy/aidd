import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { describe, expect, test } from 'bun:test';
import type { WebContext } from '../../backend/src/context.ts';
import {
	createProjectProfilePreview,
	createProjectProfilePreviews,
} from '../../backend/src/routes/projectsProfilePreview.ts';
import { discoverAuditNames } from 'aidd-shared/modes/audit-shared';

import { testTempDir } from '../_helpers/temp.ts';
import { removeTempTree } from './_helpers/remove-temp-tree.ts';

// The preview is what the Profile tab shows while the operator edits a profile: which audits the
// edited profile would run, through the real mapping and the project's own overrides. These run
// against aidd's shipped audit catalog and mapping, so a rule change that flips a posture shows
// up here rather than in the panel.
const AIDD_ROOT = resolve(import.meta.dir, '..', '..');

const lowExposureLocal = {
	authMode: 'none',
	bucket: 'single_user_local',
	criticality: 'utility',
	dataSensitivity: 'low',
	deployment: 'local',
	derivesFromTemplate: 'none',
	externalIntegrations: 'none',
	hasCliBinary: 'none',
	publishesReleaseArchives: 'none',
	shipsContainerImage: 'none',
};

const fullHardening = {
	...lowExposureLocal,
	authMode: 'tenant_rbac',
	bucket: 'public_multi_tenant',
	criticality: 'business_critical',
	dataSensitivity: 'regulated',
	deployment: 'cloud',
	externalIntegrations: 'financial_or_security',
};

async function makeProject(): Promise<string> {
	const projectDir = await testTempDir('aidd-profile-preview-');
	await mkdir(join(projectDir, '.aidd'), { recursive: true });
	await writeFile(
		join(projectDir, '.aidd', 'project-profile.json'),
		`${JSON.stringify({ ...lowExposureLocal, source: 'explicit', updatedAt: '2026-10-07T00:00:00.000Z' }, null, '\t')}\n`,
	);
	return projectDir;
}

function contextFor(projectDir: string): WebContext {
	return {
		projectService: { resolveDiscoveredProject: async () => projectDir },
		rootDir: AIDD_ROOT,
	} as unknown as WebContext;
}

const effectOf = (preview: Awaited<ReturnType<typeof createProjectProfilePreview>>, name: string) =>
	preview.audits.find((audit) => audit.name === name);

describe('project profile preview', () => {
	test('a low-exposure local profile skips the infra audits and keeps the fleet-wide ones', async () => {
		const projectDir = await makeProject();
		try {
			const preview = await createProjectProfilePreview(
				contextFor(projectDir),
				'p1',
				lowExposureLocal,
			);
			expect(preview.isLowExposureLocal).toBe(true);
			expect(preview.requiresFullHardening).toBe(false);
			expect(effectOf(preview, 'PERFORMANCE')).toEqual({
				applies: false,
				effect: 'disabled',
				name: 'PERFORMANCE',
			});
			expect(effectOf(preview, 'PROXY_AUTH_BOUNDARY')).toEqual({
				applies: true,
				effect: 'required',
				name: 'PROXY_AUTH_BOUNDARY',
			});
			// Every discovered audit, once, in name order.
			const names = preview.audits.map((audit) => audit.name);
			const discovered = await discoverAuditNames(AIDD_ROOT);
			expect(names.length).toBe(discovered.length);
			expect(new Set(names)).toEqual(new Set(discovered));
			expect(names).toEqual([...names].sort((left, right) => left.localeCompare(right)));
		} finally {
			await removeTempTree(projectDir);
		}
	});

	test('a full-hardening profile runs the audits the local profile skipped', async () => {
		const projectDir = await makeProject();
		try {
			const preview = await createProjectProfilePreview(
				contextFor(projectDir),
				'p1',
				fullHardening,
			);
			expect(preview.isLowExposureLocal).toBe(false);
			expect(preview.requiresFullHardening).toBe(true);
			expect(effectOf(preview, 'PERFORMANCE')?.applies).toBe(true);
			expect(effectOf(preview, 'SECURITY')?.applies).toBe(true);
		} finally {
			await removeTempTree(projectDir);
		}
	});

	test('a project override changes the named audit and nothing else, and the saved profile is untouched', async () => {
		const projectDir = await makeProject();
		try {
			const profilePath = join(projectDir, '.aidd', 'project-profile.json');
			const saved = await readFile(profilePath, 'utf8');
			await writeFile(
				join(projectDir, '.aidd', 'audit-profile-overrides.json'),
				`${JSON.stringify(
					{
						audits: { PERFORMANCE: 'required' },
						rules: [],
						updatedAt: '2026-10-07T00:00:00.000Z',
						version: 1,
					},
					null,
					'\t',
				)}\n`,
			);
			const preview = await createProjectProfilePreview(
				contextFor(projectDir),
				'p1',
				lowExposureLocal,
			);
			expect(effectOf(preview, 'PERFORMANCE')).toEqual({
				applies: true,
				effect: 'required',
				name: 'PERFORMANCE',
			});
			// "Nothing else" is proven against the same profile with no override: every other
			// audit's cell is identical.
			const plain = await makeProject();
			try {
				const without = await createProjectProfilePreview(
					contextFor(plain),
					'p0',
					lowExposureLocal,
				);
				expect(preview.audits.filter((audit) => audit.name !== 'PERFORMANCE')).toEqual(
					without.audits.filter((audit) => audit.name !== 'PERFORMANCE'),
				);
				expect(effectOf(without, 'PERFORMANCE')?.effect).toBe('disabled');
			} finally {
				await removeTempTree(plain);
			}
			expect(preview.isLowExposureLocal).toBe(true);
			expect(await readFile(profilePath, 'utf8')).toBe(saved);
		} finally {
			await removeTempTree(projectDir);
		}
	});

	test('the batch form previews each project under its own key with its own overrides', async () => {
		const overridden = await makeProject();
		const plain = await makeProject();
		try {
			await writeFile(
				join(overridden, '.aidd', 'audit-profile-overrides.json'),
				`${JSON.stringify({ audits: { PERFORMANCE: 'required' }, rules: [], updatedAt: '2026-10-07T00:00:00.000Z', version: 1 })}\n`,
			);
			const dirs: Record<string, string> = { hardened: plain, local: overridden };
			const context = {
				projectService: { resolveDiscoveredProject: async (id: string) => dirs[id] },
				rootDir: AIDD_ROOT,
			} as unknown as WebContext;
			const previews = await createProjectProfilePreviews(context, [
				{ profile: lowExposureLocal, projectId: 'local' },
				{ profile: lowExposureLocal, projectId: 'hardened' },
			]);
			expect(Object.keys(previews).sort()).toEqual(['hardened', 'local']);
			// Each project is read through its own directory: the override reaches one and not
			// the other, with the same profile on both.
			expect(effectOf(previews.local!, 'PERFORMANCE')?.effect).toBe('required');
			expect(effectOf(previews.hardened!, 'PERFORMANCE')?.effect).toBe('disabled');
		} finally {
			await removeTempTree(overridden);
			await removeTempTree(plain);
		}
	});

	test('an invalid facet is refused and names the facet', async () => {
		const projectDir = await makeProject();
		try {
			let refusal = '';
			try {
				await createProjectProfilePreview(contextFor(projectDir), 'p1', {
					...lowExposureLocal,
					bucket: 'galactic',
				});
			} catch (error) {
				refusal = error instanceof Error ? error.message : String(error);
			}
			expect(refusal).toContain('bucket');
		} finally {
			await removeTempTree(projectDir);
		}
	});
});
