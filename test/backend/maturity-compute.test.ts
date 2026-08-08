import { describe, expect, test } from 'bun:test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { computeMaturity } from '../../backend/src/services/maturityCompute.ts';
import { createAuditFreshnessContext } from 'aidd-shared/metadata/audit-freshness';
import { FileAiddStore } from 'aidd-shared/metadata/store';
import type { ProjectAssuranceProfile } from 'aidd-shared';

import { testTempDir } from '../_helpers/temp.ts';
const publicProfile: ProjectAssuranceProfile = {
	authMode: 'tenant_rbac',
	bucket: 'public_multi_tenant',
	criticality: 'business_critical',
	dataSensitivity: 'confidential',
	deployment: 'public_server',
	derivesFromTemplate: 'none',
	externalIntegrations: 'write_capable',
	hasCliBinary: 'none',
	publishesReleaseArchives: 'none',
	shipsContainerImage: 'none',
	source: 'explicit',
	updatedAt: '2026-05-24T00:00:00.000Z',
};

describe('maturity compute audit freshness', () => {
	test('marks audit entries stale when committed source changes exceed the threshold', async () => {
		const projectDir = await testTempDir('aidd-maturity-code-stale-');
		const catalogDir = await testTempDir('aidd-maturity-catalog-');
		try {
			await mkdir(join(catalogDir, 'audits'), { recursive: true });
			await writeFile(join(catalogDir, 'audits', 'SECURITY.md'), '# Security\n');
			await initGitProject(projectDir);
			const store = new FileAiddStore(projectDir);
			await store.writeAuditReport('SECURITY', '# SECURITY done');
			for (let index = 0; index < 10; index++) {
				await commitSourceFile(
					projectDir,
					`src/change-${index}.ts`,
					`export const change${index} = ${index};\n`,
				);
			}
			const auditFreshnessContext = createAuditFreshnessContext();

			const maturity = await computeMaturity({
				artifactCheck: null,
				auditCatalogDir: catalogDir,
				auditCatalogNames: ['SECURITY'],
				auditFreshnessContext,
				featureStats: {
					closed: 0,
					dependencyBlocked: 0,
					failing: 0,
					open: 0,
					passing: 0,
					total: 0,
					waitingApproval: 0,
				},
				interview: null,
				latestProjectAuditRun: null,
				profile: publicProfile,
				projectDir,
			});
			const auditedStage = maturity.stages.find((stage) => stage.id === 'audited');
			const security = auditedStage?.artifacts.find(
				(artifact) => artifact.label === 'SECURITY',
			);

			expect(security?.audit?.freshness).toBe('stale');
			expect(security?.audit?.staleReasons).toContain('code_commits');
			expect(security?.audit?.changes?.codeCommits).toBe(10);
			expect(auditFreshnessContext.gitNumstatLogs?.size).toBe(1);
		} finally {
			await rm(projectDir, { force: true, recursive: true });
			await rm(catalogDir, { force: true, recursive: true });
		}
	});
});

async function initGitProject(projectDir: string): Promise<void> {
	await mkdir(join(projectDir, 'src'), { recursive: true });
	await runGit(projectDir, ['init']);
	await runGit(projectDir, ['config', 'user.email', 'aidd-test@example.invalid']);
	await runGit(projectDir, ['config', 'user.name', 'aidd Test']);
	await writeFile(join(projectDir, 'package.json'), '{"name":"test-project"}\n');
	await runGit(projectDir, ['add', 'package.json']);
	await runGit(projectDir, ['commit', '-m', 'chore: init']);
}

async function commitSourceFile(
	projectDir: string,
	relativePath: string,
	content: string,
): Promise<void> {
	await writeFile(join(projectDir, relativePath), content);
	await runGit(projectDir, ['add', relativePath]);
	await runGit(projectDir, ['commit', '-m', `feat: update ${relativePath}`]);
}

async function runGit(projectDir: string, args: string[]): Promise<void> {
	const proc = Bun.spawn(['git', '-C', projectDir, ...args], {
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if ((await proc.exited) === 0) return;
	const stderr = await new Response(proc.stderr).text();
	throw new Error(`git ${args.join(' ')} failed: ${stderr}`);
}
