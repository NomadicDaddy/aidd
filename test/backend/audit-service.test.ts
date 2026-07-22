import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { AuditService } from '../../backend/src/services/auditService.ts';
import { launchAuditsImpl } from '../../backend/src/services/audit/launchAuditsImpl.ts';
import type { ProjectService } from '../../backend/src/services/projectService.ts';
import type { RunService } from '../../backend/src/services/runService.ts';
import type { ResolvedConfig } from 'aidd-shared/config';
import { FileAiddStore } from 'aidd-shared/metadata/store';

import { testTempDir } from '../_helpers/temp.ts';
function makeConfig(
	auditsEnabled: boolean,
	overrides: Partial<ResolvedConfig> = {}
): ResolvedConfig {
	return {
		auditsEnabled,
		cli: 'native',
		dirtyTreeThreshold: 50,
		idleNudgeTimeoutSeconds: 600,
		idleTimeoutSeconds: 900,
		maxConsecutiveTimeoutRetries: 2,
		maxIterations: null,
		noClean: false,
		noWorkBackoffMs: 30_000,
		quitOnAbort: 0,
		rateLimitBackoffSeconds: 300,
		rateLimitBufferSeconds: 60,
		reasoningEffort: 'low',
		timeoutSeconds: 3600,
		preflightDoctor: false,
		...overrides,
	};
}

function makeService(
	rootDir: string,
	auditsEnabled = true,
	configOverrides: Partial<ResolvedConfig> = {}
): AuditService {
	return new AuditService(
		makeConfig(auditsEnabled, configOverrides),
		{
			listProjects: async () => ({ projects: [], skippedRoots: [] }),
			resolveDiscoveredProject: async (projectId: string) => projectId,
		} as unknown as ProjectService,
		{
			launchRun: async () => ({ id: 'run_1' }),
		} as unknown as RunService,
		rootDir
	);
}

async function writeAuditDefinition(
	rootDir: string,
	name: string,
	priority: 'Critical' | 'High' | 'Medium'
): Promise<void> {
	await mkdir(join(rootDir, 'audits'), { recursive: true });
	const body = `---\ntitle: '${name}'\npriority: '${priority}'\ncategory: 'Core'\n---\n\n# ${name}\n`;
	await Bun.write(join(rootDir, 'audits', `${name}.md`), body);
}

async function writeFeature(
	projectDir: string,
	directory: string,
	feature: Record<string, unknown>
): Promise<void> {
	const dir = join(projectDir, '.aidd', 'features', directory);
	await mkdir(dir, { recursive: true });
	await writeFile(join(dir, 'feature.json'), `${JSON.stringify(feature, null, 2)}\n`);
}

describe('audit service', () => {
	test('saves audit markdown inside the audit catalog and reloads content', async () => {
		const rootDir = await testTempDir('aidd-audit-service-');
		try {
			await mkdir(join(rootDir, 'audits'), { recursive: true });
			await Bun.write(join(rootDir, 'audits', 'SECURITY.md'), '# Security\n\nOld body.\n');
			const service = makeService(rootDir);

			const saved = await service.saveAuditDefinition(
				'SECURITY',
				'# Security\n\nUpdated checklist body.'
			);

			expect(saved.name).toBe('SECURITY');
			expect(saved.content).toContain('Updated checklist body.');
			expect(await readFile(join(rootDir, 'audits', 'SECURITY.md'), 'utf8')).toContain(
				'Updated checklist body.'
			);
			await expect(
				service.saveAuditDefinition('../SECURITY', '# Security\n\nBad path.')
			).rejects.toThrow('Invalid audit name');
		} finally {
			await rm(rootDir, { force: true, recursive: true });
		}
	});

	test('populates changePotential on the audit-manager response using cross-project evidence', async () => {
		const rootDir = await testTempDir('aidd-audit-score-');
		try {
			await writeAuditDefinition(rootDir, 'SECURITY', 'Critical');
			await writeAuditDefinition(rootDir, 'AAA_REORG', 'Medium');

			const applicationsRoot = await testTempDir('aidd-audit-apps-');
			try {
				const projectDir = join(applicationsRoot, 'app-one');
				await mkdir(join(projectDir, '.aidd'), { recursive: true });
				await Bun.write(
					join(projectDir, '.aidd', 'runs.jsonl'),
					[
						JSON.stringify({
							summary: 'audit SECURITY finished with 2 finding(s) created',
							stopReason: 'completed',
						}),
						'',
					].join('\n')
				);
				await writeFeature(projectDir, 'audit-security-1700000000-csrf', {
					id: 'audit-security-1700000000-csrf',
					auditSource: 'SECURITY',
					status: 'completed',
					passes: true,
				});

				const service = makeService(rootDir, true, { applicationsRoot });
				const manager = await service.listAuditManager();

				const definitions = new Map(manager.definitions.map((d) => [d.name, d]));
				const security = definitions.get('SECURITY');
				const reorg = definitions.get('AAA_REORG');
				expect(security?.changePotential).toBeDefined();
				expect(reorg?.changePotential).toBeDefined();
				if (!security?.changePotential || !reorg?.changePotential) return;

				expect(security.changePotential.evidence.priority).toBe('Critical');
				expect(security.changePotential.evidence.actionable).toBe(true);
				expect(security.changePotential.evidence.completedRunsWithFindings).toBe(1);
				expect(security.changePotential.evidence.appsWithCompletedFeatureEvidence).toBe(1);
				expect(security.changePotential.score).toBeGreaterThan(reorg.changePotential.score);
			} finally {
				await rm(applicationsRoot, { force: true, recursive: true });
			}
		} finally {
			await rm(rootDir, { force: true, recursive: true });
		}
	});

	test('falls back gracefully when no scoring roots are configured', async () => {
		const rootDir = await testTempDir('aidd-audit-noroot-');
		try {
			await writeAuditDefinition(rootDir, 'SECURITY', 'Critical');
			const service = makeService(rootDir);
			const manager = await service.listAuditManager();
			const security = manager.definitions.find((d) => d.name === 'SECURITY');
			expect(security?.changePotential).toBeDefined();
			// With zero evidence, Critical+actionable still produces a baseline score.
			expect(security?.changePotential?.score).toBe(17);
			expect(security?.changePotential?.band).toBe('Low');
			expect(security?.changePotential?.confidence).toBe('Low');
		} finally {
			await rm(rootDir, { force: true, recursive: true });
		}
	});

	test('project audit response marks recent reports stale after committed source changes', async () => {
		const rootDir = await testTempDir('aidd-audit-project-stale-');
		try {
			await writeAuditDefinition(rootDir, 'SECURITY', 'Critical');
			const projectDir = join(rootDir, 'project');
			await mkdir(join(projectDir, '.aidd'), { recursive: true });
			await initGitProject(projectDir);
			const store = new FileAiddStore(projectDir);
			await store.writeAuditReport('SECURITY', '# SECURITY done');
			for (let index = 0; index < 10; index++) {
				await commitSourceFile(
					projectDir,
					`src/change-${index}.ts`,
					`export const change${index} = ${index};\n`
				);
			}
			const service = new AuditService(
				makeConfig(true),
				{
					listProjects: async () => ({
						projects: [
							{
								id: projectDir,
								name: 'project',
								path: projectDir,
								root: rootDir,
							},
						],
						skippedRoots: [],
					}),
					resolveDiscoveredProject: async () => projectDir,
				} as unknown as ProjectService,
				{
					launchRun: async () => ({ id: 'run_1' }),
				} as unknown as RunService,
				rootDir
			);

			const response = await service.listProjectAudits(projectDir);
			const security = response.entries.find((entry) => entry.name === 'SECURITY');

			expect(security?.freshReport).toBe(false);
			expect(security?.staleReport).toBe(true);
			expect(security?.reportFreshness?.reasons).toContain('code_commits');
			expect(security?.reportFreshness?.changes?.codeCommits).toBe(10);
		} finally {
			await rm(rootDir, { force: true, recursive: true });
		}
	});

	test('project audit response does not scan the project list for project identity', async () => {
		const rootDir = await testTempDir('aidd-audit-project-fast-');
		try {
			await writeAuditDefinition(rootDir, 'SECURITY', 'Critical');
			const projectDir = join(rootDir, 'project');
			await mkdir(join(projectDir, '.aidd'), { recursive: true });
			let projectListCalls = 0;
			const service = new AuditService(
				makeConfig(true),
				{
					listProjects: async () => {
						projectListCalls++;
						throw new Error('listProjects should not be called');
					},
					resolveDiscoveredProject: async () => projectDir,
				} as unknown as ProjectService,
				{
					launchRun: async () => ({ id: 'run_1' }),
				} as unknown as RunService,
				rootDir
			);

			const response = await service.listProjectAudits(projectDir);

			expect(projectListCalls).toBe(0);
			expect(response.projectName).toBe('project');
			expect(response.projectPath).toBe(projectDir);
		} finally {
			await rm(rootDir, { force: true, recursive: true });
		}
	});

	test('rejects launch requests while audits are globally disabled', async () => {
		const rootDir = await testTempDir('aidd-audit-disabled-');
		try {
			const service = makeService(rootDir, false);

			await expect(
				service.launchAudits({
					auditNames: ['SECURITY'],
					projectIds: [join(rootDir, 'project')],
				})
			).rejects.toThrow('Audits are disabled.');
		} finally {
			await rm(rootDir, { force: true, recursive: true });
		}
	});

	test('threads a launch-target override onto every launched audit run', async () => {
		const requests: unknown[] = [];
		const result = await launchAuditsImpl(
			{
				auditNames: ['SECURITY'],
				backend: 'codex',
				model: 'override-model',
				projectIds: ['p1', 'p2'],
				reasoningEffort: 'high',
			},
			{
				auditsEnabled: true,
				launchRun: (async (request: unknown) => {
					requests.push(request);
					return { id: `run_${requests.length}` };
				}) as unknown as Parameters<typeof launchAuditsImpl>[1]['launchRun'],
				resolveProject: async (id: string) => `D:/applications/${id}`,
			}
		);

		expect(result.runIds).toEqual(['run_1', 'run_2']);
		expect(requests).toHaveLength(2);
		expect(requests[0]).toMatchObject({
			auditNames: ['SECURITY'],
			backend: 'codex',
			mode: 'audit',
			model: 'override-model',
			projectDir: 'D:/applications/p1',
			reasoningEffort: 'high',
		});
	});

	test('auditAll launches with auditAll:true and does not consume auditNames', async () => {
		const requests: Record<string, unknown>[] = [];
		const result = await launchAuditsImpl(
			{
				auditAll: true,
				// Even a stray auditNames payload must be ignored when auditAll is set.
				auditNames: ['SECURITY'],
				projectIds: ['p1', 'p2'],
			},
			{
				auditsEnabled: true,
				launchRun: (async (request: Record<string, unknown>) => {
					requests.push(request);
					return { id: `run_${requests.length}` };
				}) as unknown as Parameters<typeof launchAuditsImpl>[1]['launchRun'],
				resolveProject: async (id: string) => `D:/applications/${id}`,
			}
		);

		expect(result.runIds).toEqual(['run_1', 'run_2']);
		expect(result.failures).toEqual([]);
		expect(requests).toHaveLength(2);
		for (const request of requests) {
			expect(request.auditAll).toBe(true);
			expect(request.mode).toBe('audit');
			// auditAll must not thread an auditNames list onto the run request.
			expect('auditNames' in request).toBe(false);
		}
		expect(requests[0]?.projectDir).toBe('D:/applications/p1');
		expect(requests[1]?.projectDir).toBe('D:/applications/p2');
	});

	test('auditAll launches all audits without requiring auditNames', async () => {
		const requests: Record<string, unknown>[] = [];
		const result = await launchAuditsImpl(
			{ auditAll: true, projectIds: ['only'] },
			{
				auditsEnabled: true,
				launchRun: (async (request: Record<string, unknown>) => {
					requests.push(request);
					return { id: `run_${requests.length}` };
				}) as unknown as Parameters<typeof launchAuditsImpl>[1]['launchRun'],
				resolveProject: async (id: string) => `D:/applications/${id}`,
			}
		);

		expect(result.runIds).toEqual(['run_1']);
		expect(requests[0]?.auditAll).toBe(true);
		expect('auditNames' in (requests[0] ?? {})).toBe(false);
	});

	test('named review launches a directive run over existing findings, not a role/audit run', async () => {
		const requests: Record<string, unknown>[] = [];
		const result = await launchAuditsImpl(
			{
				auditNames: ['SECURITY', 'HYGIENE'],
				projectIds: ['p1'],
				review: true,
			},
			{
				auditsEnabled: true,
				launchRun: (async (request: Record<string, unknown>) => {
					requests.push(request);
					return { id: `run_${requests.length}` };
				}) as unknown as Parameters<typeof launchAuditsImpl>[1]['launchRun'],
				resolveProject: async (id: string) => `D:/applications/${id}`,
			}
		);

		expect(result.runIds).toEqual(['run_1']);
		const request = requests[0] ?? {};
		// Directive mode executes the review prompt verbatim without claiming a backlog
		// feature; 'coding' + role entered role mode, whose selection excludes audit findings.
		expect(request.mode).toBe('directive');
		expect('role' in request).toBe(false);
		// Audit args on the request would flip the CLI into a fresh audit run that ignores
		// the review prompt.
		expect('auditAll' in request).toBe(false);
		expect('auditNames' in request).toBe(false);
		expect(String(request.prompt)).toContain('SECURITY, HYGIENE');
		expect(String(request.prompt)).toContain('verify the finding still reproduces');
		// The reviewer contract folded in from the retired reviewer_auditor role fragment:
		// required reading incl. CONTEXT.md, and the structured Review result output.
		expect(String(request.prompt)).toContain('/CONTEXT.md if present');
		expect(String(request.prompt)).toContain('/.aidd/assertions.md');
		expect(String(request.prompt)).toContain('"Review result"');
		expect(String(request.prompt)).toContain('findings ordered by severity');
		expect(String(request.prompt)).toContain('validation evidence');
		expect(String(request.prompt)).toContain('required fixes before completion');
		expect(String(request.prompt)).toContain('residual risk');
		expect(String(request.prompt)).toContain('do not remediate');
	});

	test('audit-all review stays a directive run and never becomes a fresh --audit-all run', async () => {
		const requests: Record<string, unknown>[] = [];
		const result = await launchAuditsImpl(
			{ auditAll: true, projectIds: ['p1'], review: true },
			{
				auditsEnabled: true,
				launchRun: (async (request: Record<string, unknown>) => {
					requests.push(request);
					return { id: `run_${requests.length}` };
				}) as unknown as Parameters<typeof launchAuditsImpl>[1]['launchRun'],
				resolveProject: async (id: string) => `D:/applications/${id}`,
			}
		);

		expect(result.runIds).toEqual(['run_1']);
		const request = requests[0] ?? {};
		expect(request.mode).toBe('directive');
		expect('auditAll' in request).toBe(false);
		expect('auditNames' in request).toBe(false);
		expect('role' in request).toBe(false);
		expect(String(request.prompt)).toContain('all audits');
	});

	test('rejects a launch with neither auditAll nor audit names selected', async () => {
		await expect(
			launchAuditsImpl(
				{ auditNames: [], projectIds: ['p1'] },
				{
					auditsEnabled: true,
					launchRun: (async () => ({ id: 'run_1' })) as unknown as Parameters<
						typeof launchAuditsImpl
					>[1]['launchRun'],
					resolveProject: async (id: string) => `D:/applications/${id}`,
				}
			)
		).rejects.toThrow('Select at least one audit or choose audit-all.');
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
	content: string
): Promise<void> {
	await writeFile(join(projectDir, relativePath), content);
	await runGit(projectDir, ['add', relativePath]);
	await commitStagedChanges(projectDir, `feat: update ${relativePath}`);
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

async function gitOutput(projectDir: string, args: string[]): Promise<string> {
	const proc = Bun.spawn(['git', '-C', projectDir, ...args], {
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if ((await proc.exited) !== 0) {
		const stderr = await new Response(proc.stderr).text();
		throw new Error(`git ${args.join(' ')} failed: ${stderr}`);
	}
	return await new Response(proc.stdout).text();
}

async function commitStagedChanges(projectDir: string, message: string): Promise<void> {
	const [tree, parent, headRef] = await Promise.all([
		gitOutput(projectDir, ['write-tree']),
		gitOutput(projectDir, ['rev-parse', 'HEAD']),
		gitOutput(projectDir, ['symbolic-ref', 'HEAD']),
	]);
	const commit = await gitOutput(projectDir, [
		'commit-tree',
		tree.trim(),
		'-p',
		parent.trim(),
		'-m',
		message,
	]);
	await runGit(projectDir, ['update-ref', headRef.trim(), commit.trim()]);
}
