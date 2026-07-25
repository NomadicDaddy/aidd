import { join } from 'node:path';

import { describe, expect, test } from 'bun:test';

import type { AgentEvent, CLIBackend, PromptInput } from 'aidd-shared/backends/types';
import type { ResolvedConfig } from 'aidd-shared/config';
import type { SelectedWork } from 'aidd-shared/modes/types';

import { parseArgs } from 'aidd-shared/args/index';
import { isProcessAlive, killProcessTree } from 'aidd-shared/lib/processTree';
import { FileAiddStore } from 'aidd-shared/metadata/store';
import { orchestratorExitCodes } from 'aidd-shared/orchestrator/result';

import { runBackendStreamLoop } from '../../cli/src/orchestrator/run/backend-stream.ts';
import { resolveRunPlan } from '../../cli/src/plan/resolve.ts';
import {
	type LeakedServerInfo,
	pollFor,
	readLeakedServerInfo,
	writeLeakFixture,
} from '../_helpers/leaky-server-fixture.ts';
import { removeTempTree } from '../../shared/src/lib/remove-temp-tree.ts';

import { testTempDir } from '../_helpers/temp.ts';
const rootDir = join(import.meta.dir, '..', '..');

// Long idle windows: the fake backend deliberately pauses between events while the leaked
// server chain is being established, and the run must not idle-abort in the middle of it.
const config: ResolvedConfig = {
	cli: 'native',
	reasoningEffort: 'low',
	maxConsecutiveTimeoutRetries: 2,
	maxIterations: 1,
	timeoutSeconds: 3600,
	preflightDoctor: false,
	idleTimeoutSeconds: 60,
	idleNudgeTimeoutSeconds: 30,
	dirtyTreeThreshold: 50,
	noWorkBackoffMs: 0,
	noClean: false,
	quitOnAbort: 0,
	rateLimitBufferSeconds: 60,
	rateLimitBackoffSeconds: 300,
};

// A backend whose child process (the intermediate) leaks a listening grandchild and exits: the
// exact wedge from build-proof (e). The backend keeps emitting tool calls (agent activity) while
// the intermediate is alive, then ends its stream — teardown must reap the orphaned listener.
class LeakingChildBackend implements CLIBackend {
	private readonly childPid: number;
	readonly idleDefaults = { killMs: 60_000, nudgeMs: 30_000 };
	info: LeakedServerInfo | undefined;
	private readonly infoPath: string;
	readonly name = 'native' as const;
	orphanAliveAtBackendExit = false;
	serverRespondedOk = false;

	constructor(childPid: number, infoPath: string) {
		this.childPid = childPid;
		this.infoPath = infoPath;
	}

	async *runPrompt(_input: PromptInput, _signal: AbortSignal): AsyncIterable<AgentEvent> {
		yield { backend: this.name, pid: this.childPid, type: 'started' };
		let tick = 0;
		while ((this.info === undefined || isProcessAlive(this.childPid)) && tick < 90) {
			if (this.info === undefined) {
				this.info = await readLeakedServerInfo(this.infoPath);
			}
			if (this.info !== undefined && !this.serverRespondedOk) {
				const response = await fetch(`http://127.0.0.1:${this.info.port}/`).catch(
					() => undefined,
				);
				this.serverRespondedOk = response !== undefined && (await response.text()) === 'ok';
			}
			// Distinct args per tick so the flailing detector never sees a repeated signature.
			yield { args: { file_path: `tick-${tick}` }, tool: 'Read', type: 'tool_call' };
			tick++;
			await Bun.sleep(400);
		}
		if (this.info !== undefined) {
			this.orphanAliveAtBackendExit = isProcessAlive(this.info.pid);
		}
		yield { exitCode: 0, filesModified: [], type: 'done' };
	}
}

describe('run teardown reaps leaked children (runBackendStreamLoop)', () => {
	test(
		'a listening child spawned during the run leaves no listener after the iteration ends',
		async () => {
			const dir = await testTempDir('aidd-run-reap-');
			const projectDir = join(dir, 'project');
			await Bun.write(join(projectDir, '.aidd', 'spec.md'), '# spec\n');
			const { grandchildPath, infoPath, intermediatePath } = await writeLeakFixture(dir);
			let backend: LeakingChildBackend | undefined;
			try {
				const intermediate = Bun.spawn(
					[process.execPath, 'run', intermediatePath, grandchildPath, infoPath],
					{ stderr: 'inherit', stdin: 'ignore', stdout: 'ignore', windowsHide: true },
				);
				backend = new LeakingChildBackend(intermediate.pid, infoPath);
				const plan = resolveRunPlan(
					parseArgs(['--project-dir', projectDir, '--cli', 'native']),
					config,
				);
				const work: SelectedWork = {
					description: 'leak regression',
					id: 'feature-core',
					kind: 'feature',
				};
				const result = await runBackendStreamLoop(
					{ backend, rootDir, store: new FileAiddStore(projectDir) },
					plan,
					work,
					{ fragments: [], snapshotKey: '', text: 'prompt' },
					new AbortController(),
					1,
					Date.now(),
					Date.now(),
					undefined,
				);
				expect(result.exitCode).toBe(orchestratorExitCodes.success);
				// The leak was real: the server answered while the run was live, and it was
				// still alive the moment the backend stream ended.
				expect(backend.serverRespondedOk).toBe(true);
				expect(backend.orphanAliveAtBackendExit).toBe(true);
				const leaked = backend.info;
				if (leaked === undefined) throw new Error('leak fixture never reported info');
				// Teardown must have reaped it: no process, no listener on its port. The window is
				// generous because the assertion is that the leak IS reaped, not that it happens within
				// some wall clock: the reap pays for a process-table probe and a tree kill, and a shared
				// 2-core CI runner running the suite in parallel is a lot slower at both than a laptop.
				await pollFor(
					() => Promise.resolve(isProcessAlive(leaked.pid) ? undefined : true),
					45_000,
				);
				expect(isProcessAlive(leaked.pid)).toBe(false);
				expect(fetch(`http://127.0.0.1:${leaked.port}/`)).rejects.toThrow();
			} finally {
				await killProcessTree(backend?.info?.pid);
				await removeTempTree(dir);
			}
		},
		{ timeout: 150_000 },
	);
});
