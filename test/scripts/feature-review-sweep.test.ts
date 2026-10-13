import { afterEach, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type {
	FeatureRecord,
	RecordStaleness,
} from '../../scripts/lib/feature-review-sweep/types.ts';

import { discoverApps } from '../../scripts/lib/feature-review-sweep/discovery.ts';
import { buildPerAppReport } from '../../scripts/lib/feature-review-sweep/report.ts';
import { scanApp } from '../../scripts/lib/feature-review-sweep/scan.ts';
import { checkRecordStaleness } from '../../scripts/lib/feature-review-sweep/staleness.ts';
import { testTempDir } from '../_helpers/temp.ts';
import { removeTempTree } from '../backend/_helpers/remove-temp-tree.ts';

const roots: string[] = [];
afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => removeTempTree(root)));
});

async function tempRoot(): Promise<string> {
	const root = await testTempDir('aidd-feature-review-sweep-');
	roots.push(root);
	return root;
}

function git(cwd: string, args: string[], committedAt?: string): void {
	const result = spawnSync('git', args, {
		cwd,
		encoding: 'utf8',
		env: {
			...process.env,
			GIT_AUTHOR_EMAIL: 'sweep@example.invalid',
			GIT_AUTHOR_NAME: 'sweep',
			GIT_COMMITTER_EMAIL: 'sweep@example.invalid',
			GIT_COMMITTER_NAME: 'sweep',
			...(committedAt
				? { GIT_AUTHOR_DATE: committedAt, GIT_COMMITTER_DATE: committedAt }
				: {}),
		},
		windowsHide: true,
	});
	if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`);
}

/** A repository with one file committed on the given day. */
async function repoWithCommit(file: string, committedAt: string): Promise<string> {
	const root = await tempRoot();
	git(root, ['init', '--quiet']);
	git(root, ['config', 'core.hooksPath', join(root, 'no-hooks')]);
	await mkdir(join(root, 'src'), { recursive: true });
	await writeFile(join(root, file), 'export const value = 1;\n');
	git(root, ['add', '--', file]);
	git(root, ['commit', '--quiet', '-m', 'feat: the code moved'], committedAt);
	return root;
}

function record(id: string, fields: Record<string, unknown>): FeatureRecord {
	return {
		dir: id,
		filePath: join('features', id, 'feature.json'),
		indent: '\t',
		initiallyInvalid: false,
		json: { id, ...fields },
		newline: '\n',
		parseError: null,
		rawText: '',
		wasRepaired: false,
	};
}

describe('the sweep finds applications from the folders, not from a table that can be removed', () => {
	test('a folder with feature records is an application; others are not', async () => {
		const root = await tempRoot();
		await mkdir(join(root, 'alpha', '.aidd', 'features'), { recursive: true });
		await mkdir(join(root, 'beta', '.aidd', 'features'), { recursive: true });
		await mkdir(join(root, 'no-records', 'src'), { recursive: true });
		await mkdir(join(root, 'alpha.old', '.aidd', 'features'), { recursive: true });
		// A linked worktree: a second checkout of a repository listed under its own name.
		await mkdir(join(root, 'alpha-worktree', '.aidd', 'features'), { recursive: true });
		await writeFile(join(root, 'alpha-worktree', '.git'), 'gitdir: elsewhere\n');
		// A file at the root is not an application.
		await writeFile(join(root, 'AGENTS.md'), '# no table here\n');

		expect(discoverApps(null, root).map((app) => app.name)).toEqual(['alpha', 'beta']);
		expect(discoverApps(new Set(['beta']), root)).toEqual([
			{
				featuresDir: join(root, 'beta', '.aidd', 'features'),
				name: 'beta',
				root: join(root, 'beta'),
			},
		]);
		expect(discoverApps(new Set(['absent']), root)).toEqual([]);
	});
});

describe('a record whose files were committed to after it was last edited', () => {
	test('is listed with the commit and the days between, and one inside a day is not', async () => {
		const root = await repoWithCommit('src/a.ts', '2026-03-10T12:00:00Z');
		const result = checkRecordStaleness(root, [
			record('done-long-ago', {
				affectedFiles: ['src/a.ts'],
				status: 'completed',
				updatedAt: '2026-03-05T12:00:00Z',
			}),
			record('left-in-progress', {
				affectedFiles: ['src/a.ts', 'src/never-existed.ts'],
				status: 'in_progress',
				updatedAt: '2026-03-08T00:00:00Z',
			}),
			record('same-piece-of-work', {
				affectedFiles: ['src/a.ts'],
				status: 'completed',
				updatedAt: '2026-03-10T00:00:00Z',
			}),
			record('edited-after-the-code', {
				affectedFiles: ['src/a.ts'],
				status: 'completed',
				updatedAt: '2026-04-01T00:00:00Z',
			}),
		]);
		expect(result.reason).toBeNull();
		expect(result.checked).toBe(4);
		expect(result.notChecked).toEqual([]);
		expect(
			result.changedSince.map((item) => [item.id, item.status, item.lagDays, item.subject]),
		).toEqual([
			['done-long-ago', 'completed', 5, 'feat: the code moved'],
			['left-in-progress', 'in_progress', 2, 'feat: the code moved'],
		]);
		expect(result.changedSince[0]?.commit).toMatch(/^[0-9a-f]{10}$/);
		expect(result.changedSince[0]?.committedAt.slice(0, 10)).toBe('2026-03-10');
	});

	test('a record that could not be checked is said so, never counted as current', async () => {
		const root = await repoWithCommit('src/a.ts', '2026-03-10T12:00:00Z');
		const result = checkRecordStaleness(root, [
			record('no-files', { affectedFiles: [], status: 'completed', updatedAt: '2026-01-01' }),
			record('files-missing-field', { status: 'completed', updatedAt: '2026-01-01' }),
			record('no-date', { affectedFiles: ['src/a.ts'], status: 'completed' }),
			record('bad-date', {
				affectedFiles: ['src/a.ts'],
				status: 'completed',
				updatedAt: 'last week',
			}),
			record('no-history', {
				affectedFiles: ['src/never-committed.ts'],
				status: 'completed',
				updatedAt: '2026-01-01T00:00:00Z',
			}),
		]);
		expect(result.checked).toBe(0);
		expect(result.changedSince).toEqual([]);
		expect(result.notChecked).toEqual([
			{ id: 'no-files', reason: 'names no affectedFiles' },
			{ id: 'files-missing-field', reason: 'names no affectedFiles' },
			{ id: 'no-date', reason: 'has no usable updatedAt' },
			{ id: 'bad-date', reason: 'has no usable updatedAt' },
			{ id: 'no-history', reason: 'none of its affectedFiles has commit history' },
		]);
	});

	test('work nobody has started is left out altogether', async () => {
		const root = await repoWithCommit('src/a.ts', '2026-03-10T12:00:00Z');
		const result = checkRecordStaleness(
			root,
			['backlog', 'pending'].map((status) =>
				record(status, {
					affectedFiles: ['src/a.ts'],
					status,
					updatedAt: '2026-01-01T00:00:00Z',
				}),
			),
		);
		expect(result).toEqual({ changedSince: [], checked: 0, notChecked: [], reason: null });
	});

	test('a folder that is not a repository checks nothing and says why', async () => {
		const root = await tempRoot();
		const result = checkRecordStaleness(root, [
			record('done', {
				affectedFiles: ['src/a.ts'],
				status: 'completed',
				updatedAt: '2026-01-01T00:00:00Z',
			}),
		]);
		expect(result.checked).toBe(0);
		expect(result.changedSince).toEqual([]);
		expect(result.reason).toBe('not a git repository, so no record could be checked');
	});
});

describe('the report of one application', () => {
	async function appWithRecord(): Promise<string> {
		const root = await repoWithCommit('src/a.ts', '2026-03-10T12:00:00Z');
		const dir = join(root, '.aidd', 'features', 'done-long-ago');
		await mkdir(dir, { recursive: true });
		await writeFile(
			join(dir, 'feature.json'),
			`${JSON.stringify(
				{
					affectedFiles: ['src/a.ts'],
					category: 'Core',
					createdAt: '2026-03-01T00:00:00.000Z',
					dependencies: [],
					description: 'A thing that was built.',
					id: 'done-long-ago',
					passes: true,
					priority: 2,
					spec: '1. Verify the thing.',
					status: 'completed',
					title: 'A built thing',
					updatedAt: '2026-03-05T12:00:00.000Z',
				},
				null,
				'\t',
			)}\n`,
		);
		return root;
	}

	test('carries the section, names the record, and a dry run writes nothing', async () => {
		const root = await appWithRecord();
		const summary = scanApp(
			{ featuresDir: join(root, '.aidd', 'features'), name: 'sample', root },
			{ apps: null, depth: 'x', dryRun: true, fixMode: 'x', reportOnly: false },
		);
		expect(summary.recordStaleness.changedSince.map((item) => item.id)).toEqual([
			'done-long-ago',
		]);
		const report = buildPerAppReport(summary);
		expect(report).toContain('## Code Changed After The Record');
		expect(report).toContain('- Records checked against history: 1');
		expect(report).toContain(
			'`done-long-ago` (completed): edited 2026-03-05, files committed 2026-03-10, 5 day(s) later, in ',
		);
		expect(report).toContain('feat: the code moved');
		const status = spawnSync('git', ['status', '--porcelain', '--', '.aidd/reports'], {
			cwd: root,
			encoding: 'utf8',
			windowsHide: true,
		});
		expect(status.stdout.trim()).toBe('');
	});

	test('says a whole application was not checked instead of printing an empty list', async () => {
		const root = await tempRoot();
		await mkdir(join(root, '.aidd', 'features'), { recursive: true });
		const summary = scanApp(
			{ featuresDir: join(root, '.aidd', 'features'), name: 'no-repository', root },
			{ apps: null, depth: 'x', dryRun: true, fixMode: 'x', reportOnly: false },
		);
		const expected: RecordStaleness = {
			changedSince: [],
			checked: 0,
			notChecked: [],
			reason: 'not a git repository, so no record could be checked',
		};
		expect(summary.recordStaleness).toEqual(expected);
		const report = buildPerAppReport(summary);
		expect(report).toContain(
			'- Not checked: not a git repository, so no record could be checked',
		);
		expect(report).not.toContain('- Records checked against history');
	});
});
