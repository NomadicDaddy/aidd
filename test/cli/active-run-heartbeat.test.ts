import { afterEach, describe, expect, test } from 'bun:test';
import { mkdir, readdir, readFile, utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AgentEvent, CLIBackend, PromptInput } from 'aidd-shared/backends/types';
import type { ResolvedConfig } from 'aidd-shared/config';
import {
	activeRunsDir,
	readCliActiveRunRecords,
	SUPPRESS_CLI_ACTIVE_RUN_ENV,
	sweepStaleActiveRunTempFiles,
} from 'aidd-shared/metadata/active-runs';
import { runStopFilePath } from 'aidd-shared/metadata/paths';
import { FileAiddStore } from 'aidd-shared/metadata/store';
import { parseArgs } from 'aidd-shared/args/index';
import { buildActiveRunCommandArgs } from '../../cli/src/orchestrator/active-run-command.ts';
import { resolveRunPlan } from '../../cli/src/plan/resolve.ts';
import { CliActiveRunHeartbeat } from '../../cli/src/orchestrator/active-run-heartbeat.ts';
import { terminalStateFromStopReason } from '../../cli/src/orchestrator/active-run-heartbeat-support.ts';
import {
	finalizeCrashedRun,
	installCrashFinalizer,
} from '../../cli/src/orchestrator/crash-finalizer.ts';
import {
	type RunFinalSummary,
	type RunObserver,
	runOrchestrator,
} from '../../cli/src/orchestrator/orchestrator.ts';
import { orchestratorExitCodes } from 'aidd-shared/orchestrator/result';
import { initialRunTotals } from '../../cli/src/orchestrator/run/types.ts';
import { removeTempTree } from '../../shared/src/lib/remove-temp-tree.ts';

const rootDir = join(import.meta.dir, '..', '..');
const tmpRoot = join(rootDir, '.tmp-active-run-heartbeat-tests');
const config: ResolvedConfig = {
	cli: 'native',
	defaultProvider: 'zhipu',
	dirtyTreeThreshold: 50,
	idleNudgeTimeoutSeconds: 1,
	idleTimeoutSeconds: 1,
	maxConsecutiveTimeoutRetries: 2,
	maxIterations: 10,
	model: 'glm-5.3',
	noClean: false,
	noWorkBackoffMs: 0,
	quitOnAbort: 0,
	rateLimitBackoffSeconds: 300,
	rateLimitBufferSeconds: 60,
	reasoningEffort: 'low',
	timeoutSeconds: 3600,
	preflightDoctor: false,
};

class FakeBackend implements CLIBackend {
	readonly idleDefaults = { killMs: 20, nudgeMs: 10 };
	readonly name = 'native' as const;
	private readonly beforeRun: () => Promise<void>;
	private readonly events: AgentEvent[];

	constructor(events: AgentEvent[], beforeRun: () => Promise<void>) {
		this.events = events;
		this.beforeRun = beforeRun;
	}

	async *runPrompt(input: PromptInput): AsyncIterable<AgentEvent> {
		void input;
		await this.beforeRun();
		for (const event of this.events) yield event;
	}
}

async function makeStore(name: string): Promise<FileAiddStore> {
	const projectDir = join(tmpRoot, name);
	await mkdir(join(projectDir, '.aidd', 'features', 'feature-core'), { recursive: true });
	await writeFile(
		join(projectDir, '.aidd', 'features', 'feature-core', 'feature.json'),
		JSON.stringify({
			id: 'feature-core',
			passes: false,
			priority: 1,
			status: 'backlog',
			title: 'Core feature',
		}),
	);
	return new FileAiddStore(projectDir);
}

async function completeFeature(store: FileAiddStore): Promise<void> {
	const feature = await store.readFeature('feature-core');
	await store.writeFeature({
		...feature,
		passes: true,
		status: 'completed',
		updatedAt: '2026-05-20T00:00:00.000Z',
	});
}

function plan(projectDir: string) {
	return resolveRunPlan(parseArgs(['--project-dir', projectDir, '--cli', 'native']), config);
}

afterEach(async () => {
	await removeTempTree(tmpRoot);
});

describe('terminalStateFromStopReason', () => {
	// A thin-budget stop is exit 0 and deliberate: the orchestrator declined an iteration it could
	// not finish. Recording it as 'failed' both misreported a clean run and (through the web's
	// continuation rule) denied the operator the follow-up the stop exists to make room for.
	test('treats a deliberate thin-budget stop as completed, not failed', () => {
		expect(terminalStateFromStopReason('wall_clock_budget')).toBe('completed');
	});

	test('still fails an expired wall-clock deadline', () => {
		expect(terminalStateFromStopReason('exit_error')).toBe('failed');
	});
});

describe('CLI active-run heartbeat', () => {
	test('builds effective replay command args with filters and resolved defaults', async () => {
		const store = await makeStore('command-args');
		const argv = [
			'--project-dir',
			'aidd',
			'--cli',
			'codex',
			'--filter-by',
			'id',
			'--filter',
			'remediation-*',
		];
		const runtimePlan = resolveRunPlan(parseArgs(argv), {
			...config,
			cli: 'codex',
			model: 'gpt-5.6-sol',
			projectDir: store.projectDir,
			reasoningEffort: 'high',
		});

		expect(buildActiveRunCommandArgs(runtimePlan, argv)).toEqual([
			'aidd',
			'--project-dir',
			store.projectDir,
			'--filter-by',
			'id',
			'--filter',
			'remediation-*',
			'--cli',
			'codex',
			'--model',
			'gpt-5.6-sol',
			'--reasoning-effort',
			'high',
		]);
	});

	test('writes and updates a CLI active-run marker', async () => {
		const store = await makeStore('direct-update');
		const runtimePlan = plan(store.projectDir);
		const heartbeat = await CliActiveRunHeartbeat.start(runtimePlan, {
			commandArgs: [
				'aidd',
				'--project-dir',
				store.projectDir,
				'--filter-by',
				'id',
				'--filter',
				'remediation-*',
				'--cli',
				'native',
				'--reasoning-effort',
				'low',
			],
		});
		expect(heartbeat).toBeDefined();
		await heartbeat?.observer.onAgentEvent?.({ backend: 'native', pid: 42, type: 'started' });

		const records = await readCliActiveRunRecords(store.projectDir);
		expect(records).toHaveLength(1);
		expect(records[0]).toMatchObject({
			backend: 'native',
			commandArgs: [
				'aidd',
				'--project-dir',
				store.projectDir,
				'--filter-by',
				'id',
				'--filter',
				'remediation-*',
				'--cli',
				'native',
				'--reasoning-effort',
				'low',
			],
			mode: 'coding',
			pid: process.pid,
			projectPath: store.projectDir,
			source: 'cli',
			state: 'agent:started',
		});

		await heartbeat?.dispose();
	});

	test('renders native structured events into the run-log so the web console has detail', async () => {
		const store = await makeStore('native-run-log');
		const logPath = join(store.projectDir, 'run.log');
		const heartbeat = await CliActiveRunHeartbeat.start(plan(store.projectDir), { logPath });
		if (!heartbeat) throw new Error('Heartbeat was not created');

		await heartbeat.observer.onAgentEvent?.({ backend: 'native', type: 'started' });
		await heartbeat.observer.onAgentEvent?.({
			type: 'tool_call',
			tool: 'bash',
			args: { command: 'git log --oneline -5' },
		});
		await heartbeat.observer.onAgentEvent?.({
			type: 'assistant_text',
			chunk: 'Audit complete. AIDD_RESULT: {"auditReports":[]}',
		});
		await heartbeat.observer.onAgentEvent?.({ type: 'done', exitCode: 0, filesModified: [] });
		await heartbeat.dispose();

		const log = await readFile(logPath, 'utf8');
		expect(log).toContain('$ git log --oneline -5');
		expect(log).toContain('Audit complete.');
		expect(log).toContain('AIDD_RESULT: { … }');
		expect(log).toContain('[done] exit 0');
		// The giant raw payload must never reach the console log.
		expect(log).not.toContain('"auditReports":[]');
	});

	test('streams native assistant deltas into the run-log without doubling the final text', async () => {
		const store = await makeStore('native-run-log-deltas');
		const logPath = join(store.projectDir, 'run.log');
		const heartbeat = await CliActiveRunHeartbeat.start(plan(store.projectDir), { logPath });
		if (!heartbeat) throw new Error('Heartbeat was not created');

		await heartbeat.observer.onAgentEvent?.({
			chunk: 'thinking about the fix',
			kind: 'reasoning',
			type: 'assistant_delta',
		});
		await heartbeat.observer.onAgentEvent?.({
			chunk: 'Patching the flaky ',
			kind: 'text',
			type: 'assistant_delta',
		});
		await heartbeat.observer.onAgentEvent?.({
			chunk: 'retry helper now.\n',
			kind: 'text',
			type: 'assistant_delta',
		});
		await heartbeat.observer.onAgentEvent?.({
			type: 'assistant_text',
			chunk: 'Patching the flaky retry helper now.',
		});
		await heartbeat.dispose();

		const log = await readFile(logPath, 'utf8');
		expect(log).toContain('[reasoning…]');
		// Raw reasoning text is progress, not transcript.
		expect(log).not.toContain('thinking about the fix');
		// Streamed once via deltas; the turn-final assistant_text must not repeat it.
		expect(log.match(/Patching the flaky retry helper now\./g)).toHaveLength(1);
	});

	test('redacts a secret split across streamed delta boundaries before it reaches the log', async () => {
		const store = await makeStore('native-run-log-delta-secret');
		const logPath = join(store.projectDir, 'run.log');
		const heartbeat = await CliActiveRunHeartbeat.start(plan(store.projectDir), { logPath });
		if (!heartbeat) throw new Error('Heartbeat was not created');

		// Neither half matches a secret rule on its own; per-chunk scrubbing would pass both
		// through, and the delta-streamed turn suppresses the final assistant_text, so the deltas
		// themselves are the redaction point.
		await heartbeat.observer.onAgentEvent?.({
			chunk: 'Calling the API with sk-ABC',
			kind: 'text',
			type: 'assistant_delta',
		});
		await heartbeat.observer.onAgentEvent?.({
			chunk: 'DEFGHIJKLMNOPQ as the key.\n',
			kind: 'text',
			type: 'assistant_delta',
		});
		await heartbeat.observer.onAgentEvent?.({
			type: 'assistant_text',
			chunk: 'Calling the API with sk-ABCDEFGHIJKLMNOPQ as the key.',
		});
		await heartbeat.dispose();

		const log = await readFile(logPath, 'utf8');
		expect(log).not.toContain('sk-ABCDEFGHIJKLMNOPQ');
		expect(log).toContain('Calling the API with [REDACTED] as the key.');
	});

	test('scrubs escaped configured credentials before persisting process output', async () => {
		const store = await makeStore('process-log-secret-fields');
		const logPath = join(store.projectDir, 'run.log');
		const runtimePlan = resolveRunPlan(parseArgs(['--project-dir', store.projectDir]), {
			...config,
			cli: 'codex',
		});
		const heartbeat = await CliActiveRunHeartbeat.start(runtimePlan, { logPath });
		if (!heartbeat) throw new Error('Heartbeat was not created');
		const value = 'AUDIT_FAKE_VALUE_123456789';
		const payload = JSON.stringify({
			output: JSON.stringify({ authToken: value, botToken: value }),
		});
		for (const chunk of payload) {
			await heartbeat.observer.onAgentEvent?.({ type: 'raw_log', stream: 'stdout', chunk });
		}
		await heartbeat.dispose();
		const output = await readFile(logPath, 'utf8');
		expect(output).not.toContain(value);
		expect(output).toContain('[REDACTED]');
	});

	test('does not render structured events for process-based backends (avoids double-logging)', async () => {
		const store = await makeStore('process-run-log');
		const logPath = join(store.projectDir, 'run.log');
		const codexPlan = resolveRunPlan(parseArgs(['--project-dir', store.projectDir]), {
			...config,
			cli: 'codex',
		});
		const heartbeat = await CliActiveRunHeartbeat.start(codexPlan, { logPath });
		if (!heartbeat) throw new Error('Heartbeat was not created');

		await heartbeat.observer.onAgentEvent?.({
			type: 'assistant_text',
			chunk: 'structured text that should not be rendered',
		});
		await heartbeat.observer.onAgentEvent?.({
			type: 'raw_log',
			stream: 'stdout',
			chunk: 'codex stdout transcript\n',
		});
		await heartbeat.dispose();

		const log = await readFile(logPath, 'utf8');
		expect(log).toContain('codex stdout transcript');
		expect(log).not.toContain('structured text that should not be rendered');
	});

	test('seeds an initial status line into the run-log for process-based backends', async () => {
		const store = await makeStore('process-run-log-intro');
		const logPath = join(store.projectDir, 'run.log');
		const codexPlan = resolveRunPlan(parseArgs(['--project-dir', store.projectDir]), {
			...config,
			cli: 'codex',
		});
		const heartbeat = await CliActiveRunHeartbeat.start(codexPlan, { logPath });
		if (!heartbeat) throw new Error('Heartbeat was not created');

		// Before any agent output arrives the log must not be empty, otherwise the web Runs
		// console reads `state: 'empty'` and looked finished while the run was still alive.
		const introOnly = await readFile(logPath, 'utf8');
		expect(introOnly.length).toBeGreaterThan(0);
		expect(introOnly).toContain('[aidd] codex run started');

		await heartbeat.observer.onAgentEvent?.({
			type: 'raw_log',
			stream: 'stdout',
			chunk: 'codex stdout transcript\n',
		});
		await heartbeat.dispose();

		const log = await readFile(logPath, 'utf8');
		expect(log).toContain('[aidd] codex run started');
		expect(log).toContain('codex stdout transcript');
	});

	test('does not seed the run-log intro for the native backend', async () => {
		const store = await makeStore('native-run-log-no-intro');
		const logPath = join(store.projectDir, 'run.log');
		const heartbeat = await CliActiveRunHeartbeat.start(plan(store.projectDir), { logPath });
		if (!heartbeat) throw new Error('Heartbeat was not created');
		await heartbeat.dispose();

		const log = await readFile(logPath, 'utf8');
		expect(log).not.toContain('run started — streaming output');
	});

	test('suppresses heartbeat markers when requested by the web supervisor', async () => {
		const store = await makeStore('suppressed');
		const heartbeat = await CliActiveRunHeartbeat.start(
			plan(store.projectDir),
			{},
			{
				[SUPPRESS_CLI_ACTIVE_RUN_ENV]: '1',
			},
		);

		expect(heartbeat).toBeUndefined();
		expect(await readCliActiveRunRecords(store.projectDir)).toEqual([]);
	});

	test('keeps marker with completion data after final run ledger summary', async () => {
		const store = await makeStore('orchestrator-finalize');
		let markerWasVisibleDuringRun = false;
		let ledgerExistedBeforeMarkerFinalization = false;
		const runtimePlan = plan(store.projectDir);
		runtimePlan.driver = {
			driverId: 'demo-skill',
			driverKind: 'skill',
			driverSha256: 'f'.repeat(64),
		};
		const heartbeat = await CliActiveRunHeartbeat.start(runtimePlan, {});
		if (!heartbeat) throw new Error('Heartbeat was not created');
		const heartbeatObserver = heartbeat.observer;
		const observer: RunObserver = {
			...heartbeatObserver,
			onFinalSummary: async (summary: RunFinalSummary) => {
				ledgerExistedBeforeMarkerFinalization = await Bun.file(
					join(store.metadataDir, 'runs.jsonl'),
				).exists();
				await heartbeatObserver.onFinalSummary?.(summary);
			},
		};
		const backend = new FakeBackend(
			[
				{
					chunk: 'AIDD_RESULT: {"featureId":"feature-core","status":"completed","passes":true}\n',
					type: 'assistant_text',
				},
				{ exitCode: 0, filesModified: ['x.ts'], type: 'done' },
			],
			async () => {
				markerWasVisibleDuringRun =
					(await readCliActiveRunRecords(store.projectDir)).length === 1;
				await completeFeature(store);
			},
		);

		const exitCode = await runOrchestrator(runtimePlan, {
			backend,
			observer,
			rootDir,
			runId: heartbeat.id,
			store,
		});
		await heartbeat.dispose();

		expect(exitCode).toBe(orchestratorExitCodes.success);
		expect(markerWasVisibleDuringRun).toBe(true);
		expect(ledgerExistedBeforeMarkerFinalization).toBe(true);
		const completedRecords = await readCliActiveRunRecords(store.projectDir, {
			includeCompleted: true,
		});
		expect(completedRecords).toHaveLength(1);
		expect(completedRecords[0]).toMatchObject({
			driverId: 'demo-skill',
			driverKind: 'skill',
			driverSha256: 'f'.repeat(64),
			state: 'completed',
			exitCode: 0,
			provider: 'zhipu',
			reasoningEffort: 'low',
			stopReason: 'completed',
		});
		expect(completedRecords[0]!.completedAt).toBeNumber();
		expect(completedRecords[0]!.durationMs).toBeNumber();
		expect(await readFile(join(store.metadataDir, 'runs.jsonl'), 'utf8')).toContain(
			'"stopReason":"completed"',
		);
		const ledger = await readFile(join(store.metadataDir, 'runs.jsonl'), 'utf8');
		const [runSummary] = ledger
			.trim()
			.split('\n')
			.map((line) => JSON.parse(line) as { runId?: unknown });
		expect(runSummary?.runId).toBe(heartbeat.id);
		expect(ledger).toContain('"mode":"coding"');
		expect(ledger).toContain('"driverId":"demo-skill"');
		expect(ledger).toContain('"driverKind":"skill"');
		expect(ledger).toContain(`"driverSha256":"${'f'.repeat(64)}"`);
		expect(ledger).toContain('"model":"glm-5.3"');
		expect(ledger).toContain('"provider":"zhipu"');
		expect(ledger).toContain('"reasoningEffort":"low"');
	});

	test('terminalizes unfinished marker on dispose after stop request', async () => {
		const store = await makeStore('dispose-stop');
		const runtimePlan = plan(store.projectDir);
		const heartbeat = await CliActiveRunHeartbeat.start(runtimePlan, {});
		if (!heartbeat) throw new Error('Heartbeat was not created');
		await writeFile(runtimePlan.stopPolicy.stopFile, 'stop\n');

		await heartbeat.dispose();

		const completedRecords = await readCliActiveRunRecords(store.projectDir, {
			includeCompleted: true,
		});
		expect(completedRecords).toHaveLength(1);
		expect(completedRecords[0]).toMatchObject({
			exitCode: 130,
			state: 'stopped',
			stopReason: 'stop_requested',
			summary: 'run stopped before final summary',
		});
	});

	test('terminalizes only the matching run after a run-scoped stop request', async () => {
		const store = await makeStore('dispose-run-stop');
		const heartbeat = await CliActiveRunHeartbeat.start(plan(store.projectDir), {});
		if (!heartbeat) throw new Error('Heartbeat was not created');
		await writeFile(runStopFilePath(store.projectDir, heartbeat.id), 'stop\n');

		await heartbeat.dispose();

		const completedRecords = await readCliActiveRunRecords(store.projectDir, {
			includeCompleted: true,
		});
		expect(completedRecords).toHaveLength(1);
		expect(completedRecords[0]).toMatchObject({
			exitCode: 130,
			state: 'stopped',
			stopReason: 'stop_requested',
		});
	});

	test('terminalizes unfinished marker as failed on dispose without stop request', async () => {
		const store = await makeStore('dispose-failed');
		const runtimePlan = plan(store.projectDir);
		const heartbeat = await CliActiveRunHeartbeat.start(runtimePlan, {
			aiddProvenance: {
				aiddDirty: true,
				aiddRevision: 'fedcba9876543210',
				aiddVersion: '3.0.0',
			},
		});
		if (!heartbeat) throw new Error('Heartbeat was not created');

		await heartbeat.dispose();

		const completedRecords = await readCliActiveRunRecords(store.projectDir, {
			includeCompleted: true,
		});
		expect(completedRecords).toHaveLength(1);
		expect(completedRecords[0]).toMatchObject({
			exitCode: 1,
			state: 'failed',
			stopReason: 'process_exit',
			summary: 'run ended before final summary',
		});
		expect(await readFile(join(store.metadataDir, 'runs.jsonl'), 'utf8')).toContain(
			'"fallbackSummary":true',
		);
		const ledger = JSON.parse(
			(await readFile(join(store.metadataDir, 'runs.jsonl'), 'utf8')).trim(),
		) as {
			aiddDirty: boolean | null;
			aiddRevision: null | string;
			aiddVersion: null | string;
		};
		expect(ledger.aiddDirty).toBe(true);
		expect(ledger.aiddRevision).toBe('fedcba9876543210');
		expect(ledger.aiddVersion).toBe('3.0.0');
	});

	test('crash finalizer targets the most recently installed heartbeat', async () => {
		// installCrashFinalizer registers process-level once-handlers; capture the listener
		// sets so the test can remove exactly what it added (firing them would exit the runner).
		const beforeUncaught = process.listeners('uncaughtException');
		const beforeUnhandled = process.listeners('unhandledRejection');
		try {
			const storeA = await makeStore('crash-rebind-a');
			const heartbeatA = await CliActiveRunHeartbeat.start(plan(storeA.projectDir), {});
			if (!heartbeatA) throw new Error('Heartbeat A was not created');
			installCrashFinalizer(heartbeatA);
			await heartbeatA.dispose();

			const storeB = await makeStore('crash-rebind-b');
			const heartbeatB = await CliActiveRunHeartbeat.start(plan(storeB.projectDir), {});
			if (!heartbeatB) throw new Error('Heartbeat B was not created');
			installCrashFinalizer(heartbeatB);

			let exitedWith: number | undefined;
			await finalizeCrashedRun('unhandledRejection', new Error('boom in run two'), (code) => {
				exitedWith = code;
			});

			expect(exitedWith).toBe(1);
			const records = await readCliActiveRunRecords(storeB.projectDir, {
				includeCompleted: true,
			});
			expect(records).toHaveLength(1);
			expect(records[0]).toMatchObject({
				state: 'failed',
				stopReason: 'process_exit',
				summary: 'unhandledRejection: boom in run two',
			});
		} finally {
			for (const listener of process.listeners('uncaughtException')) {
				if (!beforeUncaught.includes(listener)) {
					process.removeListener('uncaughtException', listener);
				}
			}
			for (const listener of process.listeners('unhandledRejection')) {
				if (!beforeUnhandled.includes(listener)) {
					process.removeListener('unhandledRejection', listener);
				}
			}
		}
	});

	test('carries a noted fatal error into the terminal record on crash-path dispose', async () => {
		const store = await makeStore('dispose-crash');
		const runtimePlan = plan(store.projectDir);
		const heartbeat = await CliActiveRunHeartbeat.start(runtimePlan, {});
		if (!heartbeat) throw new Error('Heartbeat was not created');

		heartbeat.noteFatalError('unhandledRejection: boom from a void-dispatched promise');
		await heartbeat.dispose();

		const completedRecords = await readCliActiveRunRecords(store.projectDir, {
			includeCompleted: true,
		});
		expect(completedRecords).toHaveLength(1);
		expect(completedRecords[0]).toMatchObject({
			exitCode: 1,
			state: 'failed',
			stopReason: 'process_exit',
			summary: 'unhandledRejection: boom from a void-dispatched promise',
		});
		// The fallback ledger entry still lands so the run is not invisible to the web layer.
		expect(await readFile(join(store.metadataDir, 'runs.jsonl'), 'utf8')).toContain(
			'"fallbackSummary":true',
		);
	});

	test('leaves no orphaned .tmp file in active-runs after a run finalizes', async () => {
		const store = await makeStore('no-temp-leak');
		const runtimePlan = plan(store.projectDir);
		const heartbeat = await CliActiveRunHeartbeat.start(runtimePlan, {});
		if (!heartbeat) throw new Error('Heartbeat was not created');

		// Drive several overlapping writes the way the real run does (timer + event callbacks),
		// then finalize via dispose. Each write either renames its temp into place or removes it.
		await Promise.all([
			heartbeat.observer.onAgentEvent?.({ backend: 'native', type: 'started' }),
			heartbeat.observer.onState?.({ type: 'planning' }),
			heartbeat.observer.onAgentEvent?.({ type: 'done', exitCode: 0, filesModified: [] }),
		]);
		await heartbeat.dispose();

		const entries = await readdir(activeRunsDir(store.projectDir));
		expect(entries.some((entry) => entry.endsWith('.tmp'))).toBe(false);
		expect(entries.filter((entry) => entry.endsWith('.json'))).toHaveLength(1);
	});

	test('sweeps stale orphaned .tmp files but keeps fresh ones', async () => {
		const store = await makeStore('temp-sweep');
		const dir = activeRunsDir(store.projectDir);
		await mkdir(dir, { recursive: true });
		const stale = join(dir, 'run_old.json.999.123.deadbeef.tmp');
		const fresh = join(dir, 'run_new.json.999.456.cafebabe.tmp');
		await writeFile(stale, '{}');
		await writeFile(fresh, '{}');
		const now = Date.now();
		// Age the stale temp well past the sweep window; leave the fresh one current.
		await utimes(stale, new Date(now - 600_000), new Date(now - 600_000));

		await sweepStaleActiveRunTempFiles(store.projectDir, { now });

		const entries = await readdir(dir);
		expect(entries).not.toContain('run_old.json.999.123.deadbeef.tmp');
		expect(entries).toContain('run_new.json.999.456.cafebabe.tmp');
	});

	test('surfaces stale unfinished markers as failed completed records', async () => {
		const store = await makeStore('stale-failed');
		const runtimePlan = plan(store.projectDir);
		const heartbeat = await CliActiveRunHeartbeat.start(runtimePlan, {});
		if (!heartbeat) throw new Error('Heartbeat was not created');

		const activeRecords = await readCliActiveRunRecords(store.projectDir, {
			now: Date.now() + 10_000_000,
		});
		const completedRecords = await readCliActiveRunRecords(store.projectDir, {
			includeCompleted: true,
			now: Date.now() + 10_000_000,
		});

		expect(activeRecords).toEqual([]);
		expect(completedRecords).toHaveLength(1);
		expect(completedRecords[0]).toMatchObject({
			exitCode: 1,
			state: 'failed',
			stopReason: 'heartbeat_stale',
			summary: 'run heartbeat went stale before final summary',
		});
		await heartbeat.dispose();
	});

	test('writes aiSummary into the terminal heartbeat record on safeFinalize', async () => {
		const store = await makeStore('ai-summary-finalize');
		const runtimePlan = plan(store.projectDir);
		const heartbeat = await CliActiveRunHeartbeat.start(runtimePlan, {});
		if (!heartbeat) throw new Error('Heartbeat was not created');

		// Simulate a final summary with an AI summary
		await heartbeat.observer.onFinalSummary?.({
			aiSummary: 'Completed coding run for feature-core.',
			backendExitCode: 0,
			commitsCreated: [],
			completedFeatures: ['feature-core'],
			diffStat: { deletions: 40, filesChanged: 3, insertions: 120 },
			exitCode: 0,
			fileChangePathsTruncated: false,
			filesCreated: [],
			filesEdited: [],
			runId: heartbeat.id,
			runLedgerDirty: false,
			scopeOverrun: false,
			selectedFeatures: ['feature-core'],
			stopReason: 'completed',
			summary: 'coding completed feature-core',
			totals: {
				...initialRunTotals,
				cachedTokens: 2_000,
				inputTokens: 50_000,
				iterations: 1,
				outputTokens: 8_000,
				reasoningTokens: 500,
			},
		});
		await heartbeat.dispose();

		const completedRecords = await readCliActiveRunRecords(store.projectDir, {
			includeCompleted: true,
		});
		expect(completedRecords).toHaveLength(1);
		expect(completedRecords[0]).toMatchObject({
			aiSummary: 'Completed coding run for feature-core.',
			state: 'completed',
			exitCode: 0,
			stopReason: 'completed',
		});
		// The terminal record carries the run's output metrics for the web layer to persist.
		expect(completedRecords[0]).toMatchObject({
			cachedTokens: 2_000,
			filesChanged: 3,
			inputTokens: 50_000,
			linesAdded: 120,
			linesRemoved: 40,
			outputTokens: 8_000,
			reasoningTokens: 500,
		});
	});

	test('defaults aiSummary to null for records missing the field', async () => {
		const store = await makeStore('missing-ai-summary');
		const dir = activeRunsDir(store.projectDir);
		await mkdir(dir, { recursive: true });
		// Write a record without aiSummary
		const record = {
			backend: 'native',
			completedAt: Date.now(),
			durationMs: 1000,
			exitCode: 0,
			heartbeatAt: Date.now(),
			id: 'cli_legacy_test',
			logPath: null,
			mode: 'coding',
			model: null,
			pid: 12345,
			projectName: 'missing-ai-summary',
			projectPath: store.projectDir,
			provider: null,
			reasoningEffort: null,
			source: 'cli',
			startedAt: Date.now() - 1000,
			state: 'completed',
			stopFile: `${store.projectDir}/.stop`,
			stopReason: 'completed',
			summary: 'plain run summary',
		};
		await writeFile(join(dir, 'cli_missing_summary.json'), JSON.stringify(record));

		const records = await readCliActiveRunRecords(store.projectDir, {
			includeCompleted: true,
		});
		expect(records).toHaveLength(1);
		expect(records[0]).toMatchObject({
			aiSummary: null,
			commandArgs: null,
			state: 'completed',
			summary: 'plain run summary',
		});
	});
});
