import { afterEach, describe, expect, test } from 'bun:test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AgentEvent, CLIBackend, PromptInput } from 'aidd-shared/backends/types';
import { FileAiddStore } from 'aidd-shared/metadata/store';
import { orchestratorExitCodes } from 'aidd-shared/orchestrator/result';
import { classifyWebRun } from 'aidd-shared/runs/outcome';
import { specRequiresStatus } from '../../cli/src/modes/coding/verification.ts';
import { removeTempTree } from '../../shared/src/lib/remove-temp-tree.ts';
import { rootDir, runBackend } from './_helpers/pre-existing-paths-fixture.ts';

// run_1792066967106_c0bc9f97 on beazley.org: a finding whose criterion 9 required it to stay backlog
// was honoured by the agent and recorded as exit 73. Exempting the exit alone would loop, because a
// backlog record is selected again, so these also pin that the run stops after one iteration.

const tmpRoot = join(rootDir, '.tmp-spec-mandated-park-tests');
const slowTestTimeoutMs = 15_000;
const holdingSpec =
	'1. Verify the token is rotated. 9. Until the operator rotates it, this stays backlog and passes:false.';

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

async function makeStore(name: string, spec: string): Promise<FileAiddStore> {
	const projectDir = join(tmpRoot, name);
	await mkdir(join(projectDir, '.aidd', 'features', 'feature-core'), { recursive: true });
	await writeFile(
		join(projectDir, '.aidd', 'features', 'feature-core', 'feature.json'),
		JSON.stringify({
			id: 'feature-core',
			passes: false,
			priority: 1,
			spec,
			status: 'backlog',
			title: 'Core feature',
		}),
	);
	return new FileAiddStore(projectDir);
}

async function setStatus(store: FileAiddStore, status: 'backlog'): Promise<void> {
	const feature = await store.readFeature('feature-core');
	await store.writeFeature({ ...feature, status });
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

describe('a park in the status the spec requires', () => {
	test(
		'is recorded as a park, not exit 73, and does not re-dispatch the record',
		async () => {
			const store = await makeStore('parks', holdingSpec);
			const backend = new ParkingBackend('Waiting on the operator to rotate the token.', () =>
				setStatus(store, 'backlog'),
			);
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
		'a run that forgets the marker on an ordinary record is still exit 73',
		async () => {
			const store = await makeStore('forgot', '1. Verify the token is rotated.');
			await runBackend(store, new ParkingBackend('All done, I think.'));
			const entry = await lastLedgerEntry(store);
			expect(entry.exitCode).toBe(orchestratorExitCodes.missingResult);
			expect(entry.summary).not.toContain('parked_work:');
		},
		slowTestTimeoutMs,
	);

	test(
		'silence on a holding record is still exit 73: a park needs a stated reason',
		async () => {
			const store = await makeStore('silent', holdingSpec);
			await runBackend(
				store,
				new ParkingBackend(undefined, () => setStatus(store, 'backlog')),
			);
			const entry = await lastLedgerEntry(store);
			expect(entry.exitCode).toBe(orchestratorExitCodes.missingResult);
		},
		slowTestTimeoutMs,
	);

	test(
		'an agent that leaves the claimed record in_progress is not this park, whatever it says',
		async () => {
			const store = await makeStore('claimed', holdingSpec);
			const backend = new ParkingBackend('Waiting on the operator to rotate the token.');
			await runBackend(store, backend);
			const entry = await lastLedgerEntry(store);
			expect(entry.exitCode).toBe(orchestratorExitCodes.missingResult);
		},
		slowTestTimeoutMs,
	);
});

describe('specRequiresStatus', () => {
	test.each([
		['this stays backlog and passes:false', 'backlog'],
		['Until then it stays backlog', 'backlog'],
		['must remain in in_progress until the host returns', 'in_progress'],
		['criterion 9 (stay backlog)', 'backlog'],
	])('%s requires %s', (spec, status) => {
		expect(specRequiresStatus(spec, status)).toBe(true);
	});

	test.each([
		['move it out of backlog when done', 'backlog'],
		['stays in_progress', 'backlog'],
		['the backlog stays short', 'backlog'],
	])('%s does not require %s', (spec, status) => {
		expect(specRequiresStatus(spec, status)).toBe(false);
	});

	test('no spec requires nothing', () => {
		expect(specRequiresStatus(undefined, 'backlog')).toBe(false);
	});
});
