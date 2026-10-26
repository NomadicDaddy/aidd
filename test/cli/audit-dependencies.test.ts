import { FileAiddStore } from 'aidd-shared/metadata/store';
import { afterEach, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { needsAuditDependencyInstall } from '../../cli/src/orchestrator/run/audit-dependencies-policy.ts';
import {
	rollbackWorktreeRun,
	worktreeOrchestratorDeps,
} from '../../cli/src/orchestrator/run/worktree-run-setup.ts';
import { runOrchestrator } from '../../cli/src/orchestrator/orchestrator.ts';
import {
	commitAuditDependencyFixture,
	createAuditDependencyFixtures,
	prepareDependencyFixture,
	setupRecordPath,
} from './_helpers/audit-dependencies-fixture.ts';
import { auditGit } from './_helpers/audit-worktree-fixture.ts';
import {
	FakeBackend,
	rootDir,
	saturatedSuiteTestTimeoutMs,
} from './_helpers/orchestrator-fixture.ts';

const { cleanup, fixture } = createAuditDependencyFixtures();
afterEach(cleanup);

test(
	'a real audit backend measures installed dev dependencies without sharing writable package files',
	async () => {
		const { plan, root } = await fixture({ production: true });
		await mkdir(join(root, 'node_modules'));
		await writeFile(join(root, 'node_modules', 'operator.txt'), 'operator dependency tree');
		const source = await readFile(join(root, 'dependency', 'index.ts'), 'utf8');
		const previous = process.env.NODE_ENV;
		process.env.NODE_ENV = 'production';
		let context;
		try {
			context = await prepareDependencyFixture(plan);
		} finally {
			if (previous === undefined) delete process.env.NODE_ENV;
			else process.env.NODE_ENV = previous;
		}
		const checkout = plan.worktree!.dir;
		const installed = join(checkout, 'node_modules', 'audit-fixture-dependency', 'index.ts');
		expect((await stat(installed)).nlink).toBe(1);
		const backend = new FakeBackend(
			[
				{
					type: 'assistant_text',
					chunk: `AIDD_RESULT: ${JSON.stringify({
						auditName: 'SECURITY',
						auditFindings: [],
						noFindingsJustification:
							'Inspected source.txt:1 and measured the offline measure.ts dependency import in the disposable checkout; it returned fixture-ready. The synthetic fixture has no further authentication or request surface to assess.',
						reportMarkdown:
							'# SECURITY Audit Report\n\nSynthetic measurement completed.',
					})}\n`,
				},
				{ type: 'done', exitCode: 0, filesModified: [] },
			],
			async (_call, input) => {
				expect(input.cwd).toBe(checkout);
				expect(existsSync(join(checkout, '.aidd-audit-install.bunfig.toml'))).toBe(false);
				const measurement = Bun.spawnSync([process.execPath, 'measure.ts'], {
					cwd: input.cwd,
					stdout: 'pipe',
					stderr: 'pipe',
					windowsHide: true,
				});
				expect(measurement.exitCode).toBe(0);
				expect(new TextDecoder().decode(measurement.stdout).trim()).toBe('fixture-ready');
				await writeFile(installed, 'export const value = "audit probe";\n');
				expect(await readFile(join(root, 'dependency', 'index.ts'), 'utf8')).toBe(source);
			},
		);
		const store = new FileAiddStore(root);
		const code = await runOrchestrator(plan, {
			backend,
			rootDir,
			store,
			...worktreeOrchestratorDeps(plan, context!, store, async () => false),
		});
		expect(code).toBe(0);
		expect(backend.calls).toBe(1);
		expect(existsSync(checkout)).toBe(false);
		expect(await readFile(join(root, 'node_modules', 'operator.txt'), 'utf8')).toBe(
			'operator dependency tree',
		);
		expect(existsSync(join(root, 'node_modules', 'audit-fixture-dependency'))).toBe(false);
		expect(auditGit(root, 'status', '--porcelain')).toBe('');
		const record = await Bun.file(setupRecordPath(root)).json();
		expect(record.status).toBe('complete');
		expect(record.exitCode).toBe(0);
		expect(record.command).toContain('--backend=copyfile');
		expect(record.cleanupComplete).toBe(true);
	},
	saturatedSuiteTestTimeoutMs,
);

function lifecycleForFailure(failure: string): string | undefined {
	if (failure === 'lifecycle')
		return 'console.error("synthetic setup failure"); process.exit(9);';
	if (failure === 'tracked-write') return 'await Bun.write("source.txt", "installer edit\\n");';
	if (failure === 'shared-config') {
		return 'const result = Bun.spawnSync(["git", "config", "--local", "audit.fixture", "changed"], { windowsHide: true }); process.exitCode = result.exitCode;';
	}
	if (failure === 'shared-hook') {
		return 'import path from "node:path"; const result = Bun.spawnSync(["git", "rev-parse", "--git-path", "hooks"], { stdout: "pipe", windowsHide: true }); const hooks = path.resolve(process.cwd(), new TextDecoder().decode(result.stdout).trim()); await Bun.write(path.join(hooks, "audit-fixture-hook"), "installer hook edit");';
	}
	if (failure === 'shared-common-hook') {
		return 'import path from "node:path"; const result = Bun.spawnSync(["git", "rev-parse", "--git-common-dir"], { stdout: "pipe", windowsHide: true }); const common = path.resolve(process.cwd(), new TextDecoder().decode(result.stdout).trim()); await Bun.write(path.join(common, "hooks", "audit-fixture-hook"), "installer common hook edit");';
	}
	return undefined;
}

test.each([
	'missing',
	'binary',
	'foreign',
	'mismatch',
	'lifecycle',
	'tracked-write',
	'shared-config',
	'shared-hook',
	'shared-common-hook',
])(
	'setup failure %s leaves the live tree unchanged and never starts the backend',
	async (failure) => {
		const lifecycle = lifecycleForFailure(failure);
		const { plan, root } = await fixture(lifecycle === undefined ? {} : { lifecycle });
		if (failure === 'shared-hook')
			auditGit(root, 'config', 'core.hooksPath', join(root, '.git', 'hooks'));
		if (failure === 'shared-common-hook')
			auditGit(root, 'config', 'core.hooksPath', '.githooks');
		if (failure === 'missing' || failure === 'binary')
			await Bun.file(join(root, 'bun.lock')).delete();
		if (failure === 'binary')
			await writeFile(join(root, 'bun.lockb'), 'unsupported binary fixture');
		if (failure === 'foreign') {
			const pkg = await Bun.file(join(root, 'package.json')).json();
			pkg.packageManager = 'npm@11.0.0';
			await writeFile(join(root, 'package.json'), JSON.stringify(pkg));
		}
		if (failure === 'mismatch') {
			const pkg = await Bun.file(join(root, 'package.json')).json();
			pkg.devDependencies['new-fixture-dependency'] = 'file:./dependency';
			await writeFile(join(root, 'package.json'), JSON.stringify(pkg));
		}
		commitAuditDependencyFixture(root);
		const backend = new FakeBackend([]);
		await expect(
			(async () => {
				await prepareDependencyFixture(plan);
				await runOrchestrator(plan, { backend, rootDir, store: new FileAiddStore(root) });
			})(),
		).rejects.toThrow();
		expect(backend.calls).toBe(0);
		const record = await Bun.file(setupRecordPath(root)).json();
		expect(record.status).toBe('failed');
		expect(record.endedAt).toBeString();
		if (failure.startsWith('shared-')) {
			expect(record.error).toContain('Shared Git metadata changed');
			expect(record.exitCode).toBe(0);
			expect(record.gitBefore).not.toEqual(record.gitAfter);
		}
		expect(await readFile(join(root, 'source.txt'), 'utf8')).toBe('original\n');
		await rollbackWorktreeRun(plan);
		expect(existsSync(plan.worktree!.dir)).toBe(false);
	},
	saturatedSuiteTestTimeoutMs,
);

test('policy rejects escaping local references in both manifests and transitive lock entries', async () => {
	const { root } = await fixture();
	const pkg = await Bun.file(join(root, 'package.json')).json();
	pkg.devDependencies['audit-fixture-dependency'] = 'file:../live-sibling';
	await writeFile(join(root, 'package.json'), JSON.stringify(pkg));
	expect(() => needsAuditDependencyInstall(root)).toThrow('escapes');
	pkg.devDependencies['audit-fixture-dependency'] = 'file:./dependency';
	await writeFile(join(root, 'package.json'), JSON.stringify(pkg));
	const lock = Bun.JSONC.parse(await readFile(join(root, 'bun.lock'), 'utf8')) as {
		packages: Record<string, unknown>;
	};
	lock.packages.escape = ['escape@link:../live@sibling'];
	await writeFile(join(root, 'bun.lock'), JSON.stringify(lock));
	expect(() => needsAuditDependencyInstall(root)).toThrow('escapes');
});
