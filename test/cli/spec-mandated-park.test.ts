import { afterEach, describe, expect, test } from 'bun:test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AgentEvent, CLIBackend, PromptInput } from 'aidd-shared/backends/types';
import { FileAiddStore } from 'aidd-shared/metadata/store';
import { orchestratorExitCodes } from 'aidd-shared/orchestrator/result';
import { classifyWebRun } from 'aidd-shared/runs/outcome';
import { removeTempTree } from '../../shared/src/lib/remove-temp-tree.ts';
import { rootDir, runBackend, runGit } from './_helpers/pre-existing-paths-fixture.ts';

// run_1792066967106_c0bc9f97 on beazley.org: a finding whose criterion 9 required it to stay backlog
// was honoured by the agent and recorded as exit 73. State alone cannot tell that from an agent that
// did nothing, so the park is declared. Exempting the exit alone would loop, because the record is
// selected again, so these also pin that the run stops after one iteration.

const tmpRoot = join(rootDir, '.tmp-spec-mandated-park-tests');
const slowTestTimeoutMs = 15_000;
const parkedMarker =
	'AIDD_RESULT: {"featureId":"feature-core","status":"parked","reason":"Waiting on the operator to rotate the token."}\n';

class ParkingBackend implements CLIBackend {
	readonly name = 'native' as const;
	readonly idleDefaults = { nudgeMs: 1000, killMs: 5000 };
	calls = 0;
	private readonly saying: string;
	private readonly act: (() => Promise<void>) | undefined;

	constructor(saying: string, act?: () => Promise<void>) {
		this.saying = saying;
		this.act = act;
	}

	async *runPrompt(_input: PromptInput): AsyncIterable<AgentEvent> {
		this.calls += 1;
		await this.act?.();
		yield { chunk: this.saying, type: 'assistant_text' };
		yield { exitCode: 0, filesModified: [], type: 'done' };
	}
}

async function makeStore(
	name: string,
	status: 'backlog' | 'in_progress' = 'backlog',
): Promise<FileAiddStore> {
	const projectDir = join(tmpRoot, name);
	await mkdir(join(projectDir, '.aidd', 'features', 'feature-core'), { recursive: true });
	await writeFile(
		join(projectDir, '.aidd', 'features', 'feature-core', 'feature.json'),
		JSON.stringify({
			id: 'feature-core',
			passes: false,
			priority: 1,
			spec: '1. Verify the token is rotated. 9. Keep this feature backlog until it is.',
			status,
			title: 'Core feature',
		}),
	);
	return new FileAiddStore(projectDir);
}

async function putBack(store: FileAiddStore): Promise<void> {
	const feature = await store.readFeature('feature-core');
	await store.writeFeature({ ...feature, status: 'backlog' });
}

interface LedgerEntry {
	exitCode: number;
	stopReason: string;
	summary: string;
}

async function lastLedgerEntry(store: FileAiddStore): Promise<LedgerEntry> {
	const content = await readFile(join(store.metadataDir, 'runs.jsonl'), 'utf8');
	return JSON.parse(content.trim().split('\n').at(-1) ?? '{}') as LedgerEntry;
}

afterEach(async () => {
	await removeTempTree(tmpRoot);
});

describe('a park the record spec requires', () => {
	test(
		'declared on a backlog record is a park, not exit 73, and does not re-dispatch it',
		async () => {
			const store = await makeStore('parks');
			const backend = new ParkingBackend(parkedMarker, () => putBack(store));
			await runBackend(store, backend);
			const entry = await lastLedgerEntry(store);
			expect(entry.exitCode).toBe(orchestratorExitCodes.success);
			expect(backend.calls).toBe(1);
			expect(entry.summary).toContain('parked_work:');
			expect(entry.summary).toContain('Waiting on the operator');
			const outcome = classifyWebRun({
				exitCode: entry.exitCode,
				status: 'completed',
				stopReason: entry.stopReason,
				summary: entry.summary,
			});
			expect(outcome.label).toBe('Completed · work parked');
			expect((await store.readFeature('feature-core')).status).toBe('backlog');
		},
		slowTestTimeoutMs,
	);

	test(
		'declared on a record already in_progress is a park too',
		async () => {
			const store = await makeStore('in-progress', 'in_progress');
			const backend = new ParkingBackend(parkedMarker);
			await runBackend(store, backend);
			const entry = await lastLedgerEntry(store);
			expect(entry.exitCode).toBe(orchestratorExitCodes.success);
			expect(backend.calls).toBe(1);
			expect(entry.summary).toContain('parked_work:');
			expect((await store.readFeature('feature-core')).status).toBe('in_progress');
		},
		slowTestTimeoutMs,
	);

	test(
		'putting the record back without declaring it is still exit 73, whatever the agent says',
		async () => {
			const store = await makeStore('undeclared');
			await runBackend(store, new ParkingBackend('All done, I think.', () => putBack(store)));
			const entry = await lastLedgerEntry(store);
			expect(entry.exitCode).toBe(orchestratorExitCodes.missingResult);
			expect(entry.summary).not.toContain('parked_work:');
		},
		slowTestTimeoutMs,
	);

	test(
		'a parked marker with no reason is not a park',
		async () => {
			const store = await makeStore('no-reason');
			const backend = new ParkingBackend(
				'AIDD_RESULT: {"featureId":"feature-core","status":"parked","reason":"  "}\n',
			);
			await runBackend(store, backend);
			expect(backend.calls).toBeGreaterThan(1);
			expect((await lastLedgerEntry(store)).summary).not.toContain('parked_work:');
		},
		slowTestTimeoutMs,
	);

	test(
		'a parked marker naming another record is not a park',
		async () => {
			const store = await makeStore('other-record');
			const backend = new ParkingBackend(
				'AIDD_RESULT: {"featureId":"another","status":"parked","reason":"Waiting."}\n',
			);
			await runBackend(store, backend);
			expect(backend.calls).toBeGreaterThan(1);
			expect((await lastLedgerEntry(store)).summary).not.toContain('parked_work:');
		},
		slowTestTimeoutMs,
	);

	test(
		'an iteration that committed is not a park, so the run carries on',
		async () => {
			const store = await makeStore('committed');
			const projectDir = store.projectDir;
			await Bun.spawn(['git', 'init', projectDir], {
				stderr: 'ignore',
				stdout: 'ignore',
				windowsHide: true,
			}).exited;
			await runGit(projectDir, ['config', 'user.email', 'aidd-test@example.invalid']);
			await runGit(projectDir, ['config', 'user.name', 'aidd Test']);
			await runGit(projectDir, ['add', '.']);
			await runGit(projectDir, ['commit', '-m', 'init']);
			let committed = false;
			const backend = new ParkingBackend(parkedMarker, async () => {
				if (committed) return;
				committed = true;
				await writeFile(join(projectDir, 'work.txt'), 'work\n');
				await runGit(projectDir, ['add', 'work.txt']);
				await runGit(projectDir, ['commit', '-m', 'some work']);
			});
			await runBackend(store, backend);
			// A park would have ended the run on the first call. The second makes no commit, so it
			// is the one that parks.
			expect(backend.calls).toBe(2);
		},
		slowTestTimeoutMs,
	);
});
