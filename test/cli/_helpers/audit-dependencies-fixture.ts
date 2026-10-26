import type { RunPlan } from 'aidd-shared/plan/types';

import { buildProjectCommandEnv } from 'aidd-shared/subprocess-env';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { auditGit, createAuditWorktreeFixtures } from './audit-worktree-fixture.ts';
import { gitHeavyPlan } from './orchestrator-fixture.ts';
import { prepareWorktreeRun } from '../../../cli/src/orchestrator/run/worktree-run-setup.ts';

export interface AuditDependencyFixtureOptions {
	lifecycle?: string;
	production?: boolean;
	timeoutSeconds?: number;
}

async function writeDependencyProject(root: string, lifecycle?: string): Promise<void> {
	await writeFile(join(root, '.gitignore'), '.aidd/\ndata/\nnode_modules/\n');
	await mkdir(join(root, 'dependency'));
	await writeFile(
		join(root, 'dependency', 'package.json'),
		JSON.stringify({
			name: 'audit-fixture-dependency',
			version: '1.0.0',
			exports: './index.ts',
		}),
	);
	await writeFile(
		join(root, 'dependency', 'index.ts'),
		'export const value = "fixture-ready";\n',
	);
	await writeFile(
		join(root, 'measure.ts'),
		'import { value } from "audit-fixture-dependency"; console.log(value);\n',
	);
	await writeFile(
		join(root, 'package.json'),
		JSON.stringify({
			name: 'audit-install-fixture',
			version: '1.0.0',
			private: true,
			type: 'module',
			devDependencies: { 'audit-fixture-dependency': 'file:./dependency' },
			...(lifecycle ? { scripts: { postinstall: 'bun lifecycle.ts' } } : {}),
		}),
	);
	if (lifecycle) await writeFile(join(root, 'lifecycle.ts'), lifecycle);
}

function generateLock(root: string): void {
	const result = Bun.spawnSync(
		[process.execPath, 'install', '--lockfile-only', '--ignore-scripts'],
		{
			cwd: root,
			env: { ...buildProjectCommandEnv(), NODE_ENV: 'development' },
			stderr: 'pipe',
			stdout: 'pipe',
			windowsHide: true,
		},
	);
	if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
}

export function commitAuditDependencyFixture(root: string): void {
	auditGit(root, 'add', '.');
	if (auditGit(root, 'diff', '--cached', '--name-only') === '') return;
	auditGit(root, 'commit', '-m', 'dependency fixture');
}

export function createAuditDependencyFixtures() {
	const base = createAuditWorktreeFixtures();
	return {
		cleanup: base.cleanup,
		fixture: async (options: AuditDependencyFixtureOptions = {}) => {
			const { root } = await base.fixture();
			await writeDependencyProject(root, options.lifecycle);
			generateLock(root);
			if (options.production)
				await writeFile(join(root, 'bunfig.toml'), '[install]\nproduction = true\n');
			commitAuditDependencyFixture(root);
			const plan = gitHeavyPlan(root, ['--audit', 'SECURITY']);
			plan.outputPolicy.timeoutSeconds = options.timeoutSeconds ?? 30;
			return { plan, root };
		},
	};
}

export async function prepareDependencyFixture(plan: RunPlan, runId = 'dependencies') {
	try {
		return await prepareWorktreeRun({
			launcherManaged: false,
			plan,
			requested: false,
			runId,
			webDataDir: join(plan.projectDir, 'data'),
		});
	} catch (error) {
		const evidence = setupRecordPath(plan.projectDir, runId);
		if (await Bun.file(evidence).exists()) {
			console.error(await readFile(evidence, 'utf8'));
			const stderr = evidence.replace(/\.json$/, '.stderr.log');
			if (await Bun.file(stderr).exists()) console.error(await readFile(stderr, 'utf8'));
		}
		throw error;
	}
}

export function setupRecordPath(root: string, runId = 'dependencies'): string {
	return join(root, '.aidd', 'reports', 'audit-setup', `${runId}.json`);
}
