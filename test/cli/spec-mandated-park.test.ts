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
// was honoured by the agent and recorded as exit 73. Exempting the exit alone would loop, because a
// backlog record is selected again, so these also pin that the run stops after one iteration.

const tmpRoot = join(rootDir, '.tmp-spec-mandated-park-tests');
const slowTestTimeoutMs = 15_000;
// A real hold's wording, which no pattern for "stays backlog" would have matched.
const holdingSpec = '1. Verify the token is rotated. 9. Keep this feature backlog until it is.';
const reason = 'Waiting on the operator to rotate the token.';

class ParkingBackend implements CLIBackend {
	readonly name = 'native' as const;
	readonly idleDefaults = { nudgeMs: 1000, killMs: 5000 };
	calls = 0;
	private readonly saying: string | undefined;
	private readonly act: (() => Promise<void>) | undefined;

	constructor(saying: string | undefined, act?: () => Promise<void>) {
		this.saying = saying;
		this.act = act;
	}

	async *runPrompt(_input: PromptInput): AsyncIterable<AgentEvent> {
		this.calls += 1;
		await this.act?.();
		if (this.saying !== undefined) yield { chunk: this.saying, type: 'assistant_text' };
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
			spec: holdingSpec,
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

describe('an agent holding its record in backlog', () => {
	test(
		'is recorded as a park, not exit 73, and does not re-dispatch the record',
		async () => {
			const store = await makeStore('parks');
			const backend = new ParkingBackend(reason, () => putBack(store));
			await runBackend(store, backend);
			const entry = await lastLedgerEntry(store);
			expect(entry.exitCode).toBe(orchestratorExitCodes.success);
			expect(backend.calls).toBe(1);
			expect(entry.summary).toContain('parked_work:');
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
		'silence is still exit 73: a park needs a stated reason',
		async () => {
			const store = await makeStore('silent');
			await runBackend(store, new ParkingBackend(undefined, () => putBack(store)));
			const entry = await lastLedgerEntry(store);
			expect(entry.exitCode).toBe(orchestratorExitCodes.missingResult);
		},
		slowTestTimeoutMs,
	);

	test(
		'an agent that leaves the claimed record in_progress forgot the marker, whatever it says',
		async () => {
			const store = await makeStore('claimed');
			await runBackend(store, new ParkingBackend(reason));
			const entry = await lastLedgerEntry(store);
			expect(entry.exitCode).toBe(orchestratorExitCodes.missingResult);
			expect(entry.summary).not.toContain('parked_work:');
		},
		slowTestTimeoutMs,
	);

	test(
		'a record selected in_progress cannot park by doing nothing',
		async () => {
			const store = await makeStore('already-in-progress', 'in_progress');
			await runBackend(store, new ParkingBackend('All done, I think.'));
			const entry = await lastLedgerEntry(store);
			expect(entry.exitCode).toBe(orchestratorExitCodes.missingResult);
			expect(entry.summary).not.toContain('parked_work:');
		},
		slowTestTimeoutMs,
	);

	test(
		'an iteration that committed is not a park',
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
			const backend = new ParkingBackend(reason, async () => {
				if (committed) return;
				committed = true;
				await putBack(store);
				await writeFile(join(projectDir, 'work.txt'), 'work\n');
				await runGit(projectDir, ['add', 'work.txt']);
				await runGit(projectDir, ['commit', '-m', 'some work']);
			});
			await runBackend(store, backend);
			// A park would have ended the run after the first call. The second leaves the claimed
			// record in_progress, which is a forgotten marker and ends it instead.
			expect(backend.calls).toBe(2);
			const entry = await lastLedgerEntry(store);
			expect(entry.exitCode).toBe(orchestratorExitCodes.missingResult);
			expect(entry.summary).not.toContain('parked_work:');
		},
		slowTestTimeoutMs,
	);
});
