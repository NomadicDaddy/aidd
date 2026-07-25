import type { ProjectAssuranceProfile } from 'aidd-shared';

import { describe, expect, test } from 'bun:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { MaturityDto } from '../../backend/src/types.ts';

import { computeMaturity } from '../../backend/src/services/maturityCompute.ts';
import { removeTempTree } from './_helpers/remove-temp-tree.ts';

import { testTempDir } from '../_helpers/temp.ts';
const serverProfile: ProjectAssuranceProfile = {
	authMode: 'login',
	bucket: 'internet_single_org',
	criticality: 'operational',
	dataSensitivity: 'personal',
	deployment: 'public_server',
	externalIntegrations: 'none',
	source: 'explicit',
	updatedAt: '2026-07-01T00:00:00.000Z',
};

const localProfile: ProjectAssuranceProfile = {
	...serverProfile,
	bucket: 'single_user_local',
	deployment: 'local',
};

async function computeFor(
	projectDir: string,
	catalogDir: string,
	profile: ProjectAssuranceProfile,
): Promise<MaturityDto> {
	return await computeMaturity({
		artifactCheck: null,
		auditCatalogDir: catalogDir,
		auditCatalogNames: [],
		featureStats: {
			closed: 0,
			failing: 0,
			open: 0,
			passing: 0,
			total: 0,
			waitingApproval: 0,
		},
		interview: null,
		latestProjectAuditRun: null,
		profile,
		projectDir,
	});
}

function shippedStage(maturity: MaturityDto) {
	const stage = maturity.stages.find((s) => s.id === 'shipped');
	if (!stage) throw new Error('shipped stage missing from maturity ladder');
	return stage;
}

describe('maturity shipped stage', () => {
	test('is the terminal stage and starts with all evidence missing', async () => {
		const projectDir = await testTempDir('aidd-maturity-shipped-');
		const catalogDir = await testTempDir('aidd-maturity-catalog-');
		try {
			const maturity = await computeFor(projectDir, catalogDir, serverProfile);
			const stage = shippedStage(maturity);

			expect(maturity.stages.at(-1)?.id).toBe('shipped');
			expect(stage.order).toBe(7);
			expect(stage.artifacts.map((a) => a.slug).sort()).toEqual([
				'deploy-config',
				'deployment.md',
				'release.tag',
			]);
			expect(stage.artifacts.every((a) => a.status === 'missing')).toBe(true);
			expect(stage.status).toBe('empty');
		} finally {
			await removeTempTree(projectDir);
			await removeTempTree(catalogDir);
		}
	});

	test('completes from runbook, deploy config, and a loose release tag', async () => {
		const projectDir = await testTempDir('aidd-maturity-shipped-');
		const catalogDir = await testTempDir('aidd-maturity-catalog-');
		try {
			await mkdir(join(projectDir, '.aidd'), { recursive: true });
			await writeFile(join(projectDir, '.aidd', 'deployment.md'), '# Deployment\n');
			await writeFile(join(projectDir, 'Dockerfile'), 'FROM oven/bun:alpine\n');
			await mkdir(join(projectDir, '.git', 'refs', 'tags'), { recursive: true });
			await writeFile(join(projectDir, '.git', 'refs', 'tags', 'v1.0.0'), 'abc123\n');

			const maturity = await computeFor(projectDir, catalogDir, serverProfile);
			const stage = shippedStage(maturity);
			const bySlug = new Map(stage.artifacts.map((a) => [a.slug, a.status]));

			expect(bySlug.get('deployment.md')).toBe('fresh');
			expect(bySlug.get('deploy-config')).toBe('fresh');
			expect(bySlug.get('release.tag')).toBe('fresh');
			expect(stage.status).toBe('complete');
		} finally {
			await removeTempTree(projectDir);
			await removeTempTree(catalogDir);
		}
	});

	test('detects tags recorded only in packed-refs', async () => {
		const projectDir = await testTempDir('aidd-maturity-shipped-');
		const catalogDir = await testTempDir('aidd-maturity-catalog-');
		try {
			await mkdir(join(projectDir, '.git'), { recursive: true });
			await writeFile(
				join(projectDir, '.git', 'packed-refs'),
				'# pack-refs with: peeled fully-peeled sorted\nabc123 refs/tags/v1.0.0\n',
			);

			const maturity = await computeFor(projectDir, catalogDir, serverProfile);
			const stage = shippedStage(maturity);
			const release = stage.artifacts.find((a) => a.slug === 'release.tag');

			expect(release?.status).toBe('fresh');
		} finally {
			await removeTempTree(projectDir);
			await removeTempTree(catalogDir);
		}
	});

	test('ignores packed-refs entries that are not tags', async () => {
		const projectDir = await testTempDir('aidd-maturity-shipped-');
		const catalogDir = await testTempDir('aidd-maturity-catalog-');
		try {
			await mkdir(join(projectDir, '.git'), { recursive: true });
			await writeFile(
				join(projectDir, '.git', 'packed-refs'),
				'# pack-refs with: peeled fully-peeled sorted\nabc123 refs/heads/main\n',
			);

			const maturity = await computeFor(projectDir, catalogDir, serverProfile);
			const release = shippedStage(maturity).artifacts.find((a) => a.slug === 'release.tag');

			expect(release?.status).toBe('missing');
		} finally {
			await removeTempTree(projectDir);
			await removeTempTree(catalogDir);
		}
	});

	test('accepts a non-empty workflows directory as deploy config', async () => {
		const projectDir = await testTempDir('aidd-maturity-shipped-');
		const catalogDir = await testTempDir('aidd-maturity-catalog-');
		try {
			await mkdir(join(projectDir, '.github', 'workflows'), { recursive: true });
			await writeFile(
				join(projectDir, '.github', 'workflows', 'deploy.yml'),
				'name: deploy\n',
			);

			const maturity = await computeFor(projectDir, catalogDir, serverProfile);
			const deployConfig = shippedStage(maturity).artifacts.find(
				(a) => a.slug === 'deploy-config',
			);

			expect(deployConfig?.status).toBe('fresh');
		} finally {
			await removeTempTree(projectDir);
			await removeTempTree(catalogDir);
		}
	});

	test('does not require deploy config for local-deployment profiles', async () => {
		const projectDir = await testTempDir('aidd-maturity-shipped-');
		const catalogDir = await testTempDir('aidd-maturity-catalog-');
		try {
			await mkdir(join(projectDir, '.aidd'), { recursive: true });
			await writeFile(join(projectDir, '.aidd', 'deployment.md'), '# Deployment\n');
			await mkdir(join(projectDir, '.git', 'refs', 'tags'), { recursive: true });
			await writeFile(join(projectDir, '.git', 'refs', 'tags', 'v1.0.0'), 'abc123\n');

			const maturity = await computeFor(projectDir, catalogDir, localProfile);
			const stage = shippedStage(maturity);

			expect(stage.artifacts.map((a) => a.slug).sort()).toEqual([
				'deployment.md',
				'release.tag',
			]);
			expect(stage.status).toBe('complete');
		} finally {
			await removeTempTree(projectDir);
			await removeTempTree(catalogDir);
		}
	});
});
