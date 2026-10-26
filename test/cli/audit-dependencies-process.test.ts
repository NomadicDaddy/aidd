import { isProcessAlive } from 'aidd-shared/lib/processTree';
import { afterEach, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { readFile, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { needsAuditDependencyInstall } from '../../cli/src/orchestrator/run/audit-dependencies-policy.ts';
import { createAuditSetupEvidence } from '../../cli/src/orchestrator/run/audit-dependencies-evidence.ts';
import { runAuditDependencyInstall } from '../../cli/src/orchestrator/run/audit-dependencies-process.ts';
import {
	prepareWorktreeRun,
	rollbackWorktreeRun,
} from '../../cli/src/orchestrator/run/worktree-run-setup.ts';
import {
	commitAuditDependencyFixture,
	createAuditDependencyFixtures,
	prepareDependencyFixture,
	setupRecordPath,
} from './_helpers/audit-dependencies-fixture.ts';
import { saturatedSuiteTestTimeoutMs } from './_helpers/orchestrator-fixture.ts';

const { cleanup, fixture } = createAuditDependencyFixtures();
afterEach(cleanup);

const lingeringLifecycle = [
	'const child = Bun.spawn([process.execPath, "-e", "setInterval(() => {}, 1000)"], { stdout: "ignore", stderr: "ignore", windowsHide: true });',
	'await Bun.write("node_modules/setup-pids.json", JSON.stringify([process.pid, child.pid]));',
	'await Bun.sleep(60000);',
].join('\n');

async function stopAfterLifecycleStarts(root: string, stopFile: string): Promise<void> {
	const marker = join(
		root,
		'data',
		'worktrees',
		'dependencies',
		'node_modules',
		'setup-pids.json',
	);
	const deadline = Date.now() + 10_000;
	while (!existsSync(marker) && Date.now() < deadline) await Bun.sleep(25);
	if (!existsSync(marker)) throw new Error('Synthetic lifecycle never started.');
	await writeFile(stopFile, 'stop');
}

test.each(['stopped', 'timeout'] as const)(
	'setup %s stops owned lifecycle descendants before cleanup',
	async (status) => {
		const { plan, root } = await fixture({
			lifecycle: lingeringLifecycle,
			timeoutSeconds: status === 'timeout' ? 2 : 20,
		});
		const stop =
			status === 'stopped'
				? stopAfterLifecycleStarts(root, plan.stopPolicy.stopFile)
				: undefined;
		await expect(prepareDependencyFixture(plan)).rejects.toThrow(`setup ${status}`);
		await stop;
		const checkout = plan.worktree!.dir;
		const pids = (await Bun.file(
			join(checkout, 'node_modules', 'setup-pids.json'),
		).json()) as number[];
		for (const pid of pids) expect(isProcessAlive(pid)).toBe(false);
		const record = await Bun.file(setupRecordPath(root)).json();
		expect(record.status).toBe(status);
		expect(record.cleanupComplete).toBe(true);
		expect(record.survivors).toEqual([]);
		expect(record.exitCode).not.toBe(0);
		await rollbackWorktreeRun(plan);
		expect(existsSync(checkout)).toBe(false);
	},
	saturatedSuiteTestTimeoutMs,
);

test(
	'an unconfirmed setup cleanup retains its checkout for diagnosis',
	async () => {
		const { plan } = await fixture();
		await prepareDependencyFixture(plan);
		plan.worktree!.setupCleanupIncomplete = true;
		await rollbackWorktreeRun(plan);
		expect(existsSync(plan.worktree!.dir)).toBe(true);
		delete plan.worktree!.setupCleanupIncomplete;
		await rollbackWorktreeRun(plan);
		expect(existsSync(plan.worktree!.dir)).toBe(false);
	},
	saturatedSuiteTestTimeoutMs,
);

test(
	'a missing install executable records a failed exit without starting a provider',
	async () => {
		const { root } = await fixture();
		const evidence = await createAuditSetupEvidence(root, 'missing-tool', root);
		evidence.command[0] = join(root, 'no-such-bun-executable');
		const result = await runAuditDependencyInstall(evidence, Date.now() + 1000, []);
		expect(result.status).toBe('failed');
		expect(result.exitCode).toBeNull();
		expect(result.error).toContain('no-such-bun-executable');
		expect(result.cleanupComplete).toBe(true);
	},
	saturatedSuiteTestTimeoutMs,
);

test('a local dependency through a junction or symlink cannot reach a live sibling', async () => {
	const { root } = await fixture();
	const { root: sibling } = await fixture();
	await symlink(
		sibling,
		join(root, 'external'),
		process.platform === 'win32' ? 'junction' : 'dir',
	);
	const pkg = await Bun.file(join(root, 'package.json')).json();
	pkg.devDependencies['audit-fixture-dependency'] = 'file:./external/dependency';
	await writeFile(join(root, 'package.json'), JSON.stringify(pkg));
	expect(() => needsAuditDependencyInstall(root)).toThrow('outside');
	expect(await readFile(join(sibling, 'source.txt'), 'utf8')).toBe('original\n');
});

test(
	'absent JS manifests, coding worktrees and explicit live audits do not provision dependencies',
	async () => {
		const { plan, root } = await fixture();
		await Bun.file(join(root, 'package.json')).delete();
		commitAuditDependencyFixture(root);
		await prepareDependencyFixture(plan);
		expect(existsSync(setupRecordPath(root))).toBe(false);
		await rollbackWorktreeRun(plan);
		const coding = (await fixture()).plan;
		coding.mode = 'coding';
		await prepareWorktreeRun({
			launcherManaged: false,
			plan: coding,
			requested: true,
			runId: 'coding',
			webDataDir: join(coding.projectDir, 'data'),
		});
		expect(existsSync(join(coding.worktree!.dir, 'node_modules'))).toBe(false);
		await rollbackWorktreeRun(coding);
		const live = (await fixture()).plan;
		live.audit!.liveTree = true;
		expect(await prepareDependencyFixture(live)).toBeNull();
		expect(live.worktree).toBeUndefined();
		expect(existsSync(join(live.projectDir, 'node_modules'))).toBe(false);
	},
	saturatedSuiteTestTimeoutMs,
);
