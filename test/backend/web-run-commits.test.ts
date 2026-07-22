import { describe, expect, test } from 'bun:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { WebContext } from '../../backend/src/context.ts';
import type { RunRecord } from '../../backend/src/types.ts';

import { createRunsRoutes } from '../../backend/src/routes/runs.ts';
import { commitRefsFromUnknown } from '../../backend/src/services/projectMetadata/iterationParseHelpers.ts';
import { removeTempTree } from './_helpers/remove-temp-tree.ts';

import { testTempDir } from '../_helpers/temp.ts';
async function makeProjectDir(): Promise<string> {
	return testTempDir('aidd-run-commits-');
}

function stubRunsApp(record: RunRecord | undefined) {
	return createRunsRoutes({
		runService: {
			getRunRecord: async () => record,
		},
	} as unknown as WebContext);
}

function runRecordFor(projectPath: string, id: string): RunRecord {
	return { id, projectPath } as RunRecord;
}

async function fetchCommits(app: ReturnType<typeof createRunsRoutes>, id: string) {
	const response = await app.handle(new Request(`http://localhost/api/v1/runs/${id}/commits`));
	expect(response.status).toBe(200);
	return (await response.json()) as {
		commits: { hash: string; subject: string }[];
		commitsCreatedCount: number;
		fileChanges: {
			created: string[];
			edited: string[];
			source: 'iteration-artifacts' | 'ledger' | 'unavailable';
			truncated: boolean;
		};
		filesCreated: number;
		filesEdited: number;
		reason: null | string;
		state: string;
	};
}

describe('web run commits route', () => {
	test('returns recorded commits for a ledger entry, filtering malformed hashes', async () => {
		const projectDir = await makeProjectDir();
		try {
			await mkdir(join(projectDir, '.aidd'), { recursive: true });
			const lines = [
				JSON.stringify({
					commitsCreated: [
						{ hash: 'a'.repeat(40), subject: 'feat: add launch preview' },
						{ hash: 'not-a-sha', subject: 'rejected' },
						{ hash: 'b'.repeat(7), subject: 'fix: short hash is fine' },
						{ hash: 'c'.repeat(40) }, // missing subject → rejected
					],
					runId: 'run-1',
					startedAt: '2026-06-01T00:00:00.000Z',
				}),
				'{ malformed json',
				JSON.stringify({ runId: 'run-2', startedAt: '2026-06-02T00:00:00.000Z' }),
			];
			await writeFile(join(projectDir, '.aidd', 'runs.jsonl'), `${lines.join('\n')}\n`);

			const app = stubRunsApp(runRecordFor(projectDir, 'run-1'));
			const body = await fetchCommits(app, 'run-1');
			expect(body.state).toBe('ok');
			expect(body.commits).toEqual([
				{ hash: 'a'.repeat(40), subject: 'feat: add launch preview' },
				{ hash: 'b'.repeat(7), subject: 'fix: short hash is fine' },
			]);
			expect(body.commitsCreatedCount).toBe(2);
			expect(body.fileChanges).toEqual({
				created: [],
				edited: [],
				source: 'unavailable',
				truncated: false,
			});
			expect(body.filesCreated).toBe(0);
			expect(body.filesEdited).toBe(0);
		} finally {
			await removeTempTree(projectDir);
		}
	});

	test('reports ok with no commits when the ledger entry lacks commitsCreated', async () => {
		const projectDir = await makeProjectDir();
		try {
			await mkdir(join(projectDir, '.aidd'), { recursive: true });
			await writeFile(
				join(projectDir, '.aidd', 'runs.jsonl'),
				`${JSON.stringify({ runId: 'run-2', startedAt: '2026-06-02T00:00:00.000Z' })}\n`
			);
			const app = stubRunsApp(runRecordFor(projectDir, 'run-2'));
			const body = await fetchCommits(app, 'run-2');
			expect(body.state).toBe('ok');
			expect(body.commits).toEqual([]);
		} finally {
			await removeTempTree(projectDir);
		}
	});

	test('reports not-recorded when no ledger line matches the run id', async () => {
		const projectDir = await makeProjectDir();
		try {
			await mkdir(join(projectDir, '.aidd'), { recursive: true });
			await writeFile(
				join(projectDir, '.aidd', 'runs.jsonl'),
				`${JSON.stringify({ startedAt: '2026-06-02T00:00:00.000Z' })}\n`
			);
			const app = stubRunsApp(runRecordFor(projectDir, 'run-3'));
			const body = await fetchCommits(app, 'run-3');
			expect(body.state).toBe('not-recorded');
			expect(body.commits).toEqual([]);
		} finally {
			await removeTempTree(projectDir);
		}
	});

	test('reports ledger-missing when the project has no runs.jsonl', async () => {
		const projectDir = await makeProjectDir();
		try {
			const app = stubRunsApp(runRecordFor(projectDir, 'run-4'));
			const body = await fetchCommits(app, 'run-4');
			expect(body.state).toBe('ledger-missing');
			expect(body.commits).toEqual([]);
		} finally {
			await removeTempTree(projectDir);
		}
	});

	test('reports run-not-found when the run record does not exist', async () => {
		const app = stubRunsApp(undefined);
		const body = await fetchCommits(app, 'missing-run');
		expect(body.state).toBe('run-not-found');
		expect(body.commits).toEqual([]);
		expect(body.commitsCreatedCount).toBe(0);
		expect(body.fileChanges).toEqual({
			created: [],
			edited: [],
			source: 'unavailable',
			truncated: false,
		});
		expect(body.filesCreated).toBe(0);
		expect(body.filesEdited).toBe(0);
	});

	test('returns totals fields when the ledger entry has totals', async () => {
		const projectDir = await makeProjectDir();
		try {
			await mkdir(join(projectDir, '.aidd'), { recursive: true });
			await writeFile(
				join(projectDir, '.aidd', 'runs.jsonl'),
				`${JSON.stringify({
					commitsCreated: [{ hash: 'd'.repeat(40), subject: 'feat: real work' }],
					runId: 'run-5',
					startedAt: '2026-06-01T00:00:00.000Z',
					totals: { commitsCreated: 1, filesCreated: 3, filesEdited: 2 },
				})}\n`
			);
			const app = stubRunsApp(runRecordFor(projectDir, 'run-5'));
			const body = await fetchCommits(app, 'run-5');
			expect(body.state).toBe('ok');
			expect(body.commits).toEqual([{ hash: 'd'.repeat(40), subject: 'feat: real work' }]);
			expect(body.commitsCreatedCount).toBe(1);
			expect(body.filesCreated).toBe(3);
			expect(body.filesEdited).toBe(2);
			expect(body.fileChanges.source).toBe('unavailable');
		} finally {
			await removeTempTree(projectDir);
		}
	});

	test('returns ledger file path arrays with a bounded path list', async () => {
		const projectDir = await makeProjectDir();
		try {
			await mkdir(join(projectDir, '.aidd'), { recursive: true });
			const editedPaths = Array.from({ length: 55 }, (_, index) => `src/file-${index}.ts`);
			await writeFile(
				join(projectDir, '.aidd', 'runs.jsonl'),
				`${JSON.stringify({
					filesCreated: ['src/new.ts'],
					filesEdited: editedPaths,
					runId: 'run-ledger-paths',
					startedAt: '2026-06-01T00:00:00.000Z',
					totals: { commitsCreated: 0, filesCreated: 1, filesEdited: 55 },
				})}\n`
			);
			const app = stubRunsApp(runRecordFor(projectDir, 'run-ledger-paths'));
			const body = await fetchCommits(app, 'run-ledger-paths');
			expect(body.state).toBe('ok');
			expect(body.fileChanges.source).toBe('ledger');
			expect(body.fileChanges.created).toEqual(['src/new.ts']);
			expect(body.fileChanges.edited).toHaveLength(50);
			expect(body.fileChanges.edited[0]).toBe('src/file-0.ts');
			expect(body.fileChanges.edited[49]).toBe('src/file-49.ts');
			expect(body.fileChanges.truncated).toBe(true);
		} finally {
			await removeTempTree(projectDir);
		}
	});

	test('recovers file path arrays from iteration artifacts for older ledger rows', async () => {
		const projectDir = await makeProjectDir();
		try {
			await mkdir(join(projectDir, '.aidd', 'iterations'), { recursive: true });
			await writeFile(
				join(projectDir, '.aidd', 'runs.jsonl'),
				`${JSON.stringify({
					commitsCreated: [],
					runId: 'run-artifact-paths',
					startedAt: '2026-06-01T00:00:00.000Z',
					totals: { commitsCreated: 0, filesCreated: 1, filesEdited: 3 },
				})}\n`
			);
			await writeFile(
				join(projectDir, '.aidd', 'iterations', '001.json'),
				JSON.stringify({
					filesCreated: ['src/ignored.ts'],
					filesEdited: ['src/ignored-edit.ts'],
					runId: 'another-run',
				})
			);
			await writeFile(
				join(projectDir, '.aidd', 'iterations', '002.json'),
				JSON.stringify({
					filesCreated: ['src/new.ts'],
					filesEdited: [
						'src/a.ts',
						'src/a.ts',
						'src/b.ts',
						join(projectDir, '.aidd', 'CHANGELOG.md'),
					],
					runId: 'run-artifact-paths',
				})
			);
			const app = stubRunsApp(runRecordFor(projectDir, 'run-artifact-paths'));
			const body = await fetchCommits(app, 'run-artifact-paths');
			expect(body.state).toBe('ok');
			expect(body.fileChanges).toEqual({
				created: ['src/new.ts'],
				edited: ['src/a.ts', 'src/b.ts', '.aidd/CHANGELOG.md'],
				source: 'iteration-artifacts',
				truncated: false,
			});
		} finally {
			await removeTempTree(projectDir);
		}
	});

	test('returns commitsCreatedCount from totals even when attributed commits list is empty', async () => {
		// Simulates a directive run where commits were filtered by feature attribution,
		// leaving commitsCreated:[] but totals.commitsCreated > 0.
		const projectDir = await makeProjectDir();
		try {
			await mkdir(join(projectDir, '.aidd'), { recursive: true });
			await writeFile(
				join(projectDir, '.aidd', 'runs.jsonl'),
				`${JSON.stringify({
					commitsCreated: [],
					runId: 'run-6',
					startedAt: '2026-06-01T00:00:00.000Z',
					totals: { commitsCreated: 2, filesCreated: 1, filesEdited: 1 },
				})}\n`
			);
			const app = stubRunsApp(runRecordFor(projectDir, 'run-6'));
			const body = await fetchCommits(app, 'run-6');
			expect(body.state).toBe('ok');
			expect(body.commits).toEqual([]);
			expect(body.commitsCreatedCount).toBe(2);
			expect(body.filesCreated).toBe(1);
			expect(body.filesEdited).toBe(1);
			expect(body.fileChanges).toEqual({
				created: [],
				edited: [],
				source: 'unavailable',
				truncated: false,
			});
		} finally {
			await removeTempTree(projectDir);
		}
	});

	test('returns zero counts when ledger entry has no totals', async () => {
		const projectDir = await makeProjectDir();
		try {
			await mkdir(join(projectDir, '.aidd'), { recursive: true });
			await writeFile(
				join(projectDir, '.aidd', 'runs.jsonl'),
				`${JSON.stringify({
					commitsCreated: [],
					runId: 'run-7',
					startedAt: '2026-06-01T00:00:00.000Z',
				})}\n`
			);
			const app = stubRunsApp(runRecordFor(projectDir, 'run-7'));
			const body = await fetchCommits(app, 'run-7');
			expect(body.state).toBe('ok');
			expect(body.commits).toEqual([]);
			expect(body.commitsCreatedCount).toBe(0);
			expect(body.filesCreated).toBe(0);
			expect(body.filesEdited).toBe(0);
		} finally {
			await removeTempTree(projectDir);
		}
	});
});

describe('commitRefsFromUnknown', () => {
	test('caps the parsed list at 50 entries', () => {
		const value = Array.from({ length: 60 }, (_, index) => ({
			hash: index.toString(16).padStart(40, '0'),
			subject: `commit ${index}`,
		}));
		expect(commitRefsFromUnknown(value)).toHaveLength(50);
	});

	test('returns empty for non-array input', () => {
		expect(commitRefsFromUnknown(undefined)).toEqual([]);
		expect(commitRefsFromUnknown('abc')).toEqual([]);
		expect(commitRefsFromUnknown({ hash: 'a'.repeat(40), subject: 'x' })).toEqual([]);
	});
});
