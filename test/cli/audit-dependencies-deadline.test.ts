import type { AgentEvent, CLIBackend, PromptInput } from 'aidd-shared/backends/types';

import { FileAiddStore } from 'aidd-shared/metadata/store';
import { orchestratorExitCodes } from 'aidd-shared/orchestrator/result';
import { afterEach, expect, test } from 'bun:test';

import { snapshotAuditGit } from '../../cli/src/orchestrator/run/audit-dependencies-git.ts';
import { worktreeOrchestratorDeps } from '../../cli/src/orchestrator/run/worktree-run-setup.ts';
import { runOrchestrator } from '../../cli/src/orchestrator/orchestrator.ts';
import {
	createAuditDependencyFixtures,
	prepareDependencyFixture,
	setupRecordPath,
} from './_helpers/audit-dependencies-fixture.ts';
import {
	FakeBackend,
	rootDir,
	saturatedSuiteTestTimeoutMs,
} from './_helpers/orchestrator-fixture.ts';

const { cleanup, fixture } = createAuditDependencyFixtures();
afterEach(cleanup);

class DeadlineBackend implements CLIBackend {
	readonly name = 'native' as const;
	readonly idleDefaults = { killMs: 30_000, nudgeMs: 20_000 };
	abortedAt = 0;
	calls = 0;

	async *runPrompt(_input: PromptInput, signal: AbortSignal): AsyncIterable<AgentEvent> {
		this.calls++;
		yield { backend: 'native', type: 'started' };
		await new Promise<void>((resolve) => {
			const finish = (): void => {
				this.abortedAt = Date.now();
				resolve();
			};
			if (signal.aborted) finish();
			else signal.addEventListener('abort', finish, { once: true });
		});
		yield { reason: 'aborted', type: 'error' };
	}
}

test(
	'slow setup leaves execution only the original run budget remainder',
	async () => {
		const { plan, root } = await fixture({
			lifecycle: 'await Bun.sleep(1800);',
			timeoutSeconds: 6,
		});
		const context = await prepareDependencyFixture(plan);
		const setup = await Bun.file(setupRecordPath(root)).json();
		expect(setup.status).toBe('complete');
		expect(setup.runStartedAtMs).toBe(plan.runStartedAtMs);
		expect(setup.deadlineAtMs).toBe(plan.runStartedAtMs! + 6000);
		expect(Date.now() - plan.runStartedAtMs!).toBeGreaterThanOrEqual(1800);
		const backend = new DeadlineBackend();
		const store = new FileAiddStore(root);
		const code = await runOrchestrator(plan, {
			backend,
			rootDir,
			store,
			...worktreeOrchestratorDeps(plan, context!, store, async () => false),
		});
		expect(code).toBe(orchestratorExitCodes.aborted);
		expect(backend.calls).toBe(1);
		expect(backend.abortedAt).toBeGreaterThanOrEqual(setup.deadlineAtMs - 100);
		expect(backend.abortedAt).toBeLessThan(setup.deadlineAtMs + 1200);
	},
	saturatedSuiteTestTimeoutMs,
);

test(
	'execution never starts a backend after the setup deadline is exhausted',
	async () => {
		const { plan, root } = await fixture({ timeoutSeconds: 3 });
		const context = await prepareDependencyFixture(plan);
		await Bun.sleep(Math.max(0, plan.runStartedAtMs! + 3001 - Date.now()));
		const backend = new FakeBackend([]);
		const store = new FileAiddStore(root);
		const code = await runOrchestrator(plan, {
			backend,
			rootDir,
			store,
			...worktreeOrchestratorDeps(plan, context!, store, async () => false),
		});
		expect(code).toBe(orchestratorExitCodes.aborted);
		expect(backend.calls).toBe(0);
	},
	saturatedSuiteTestTimeoutMs,
);

test(
	'an exhausted setup budget prevents installation and Git inspection',
	async () => {
		const { plan, root } = await fixture({ timeoutSeconds: 1 });
		plan.runStartedAtMs = Date.now() - 2000;
		await expect(prepareDependencyFixture(plan)).rejects.toThrow('setup timeout');
		const setup = await Bun.file(setupRecordPath(root)).json();
		expect(setup.status).toBe('timeout');
		expect(setup.pid).toBeUndefined();
		expect(setup.gitBefore).toBeUndefined();
		expect(() => snapshotAuditGit(root, Date.now() - 1)).toThrow('deadline exhausted');
	},
	saturatedSuiteTestTimeoutMs,
);
