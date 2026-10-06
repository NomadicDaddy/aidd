import { afterEach, describe, expect, test } from 'bun:test';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { Hold, RunRecord, TreeAudit } from '../../scripts/lib/advisory-audit/types.ts';

import { findHold, holdStatus, readHolds } from '../../scripts/lib/advisory-audit/holds.ts';
import {
	diffRuns,
	findingKey,
	historyLine,
	renderReport,
} from '../../scripts/lib/advisory-audit/report.ts';
import { removeTempTree } from '../../shared/src/lib/remove-temp-tree.ts';
import { testTempDir } from '../_helpers/temp.ts';

const NOW = new Date('2026-10-06T19:00:00Z');

const finding = (pkg: string, ghsa: string, severity = 'high') => ({
	ghsa,
	package: pkg,
	severity,
	title: `${pkg} advisory`,
	url: `https://github.com/advisories/${ghsa}`,
	vulnerableVersions: '<9',
});

const tree = (key: string, overrides: Partial<TreeAudit> = {}): TreeAudit => ({
	durationMs: 5,
	findings: [],
	key,
	lockOnly: [],
	notInstalled: false,
	owners: ['alice'],
	status: 'audited',
	treeDir: `D:\\applications\\${key}`,
	...overrides,
});

const record = (trees: TreeAudit[]): RunRecord => ({
	command: 'bun audit --json',
	generatedAt: NOW.toISOString(),
	noSurface: ['D:\\scripts'],
	roots: ['D:\\applications', 'D:\\scripts'],
	skipped: [
		{
			key: 'deeper',
			lockPath: 'D:\\applications\\deeper\\dist\\r1\\bun.lock',
			reason: 'historical release artifact',
		},
	],
	trees,
	unreadable: [],
});

const hold = (overrides: Partial<Hold> = {}): Hold => ({
	blockedOn: 'human',
	date: '2026-09-26',
	ghsa: 'GHSA-6688-9rhm-gjv2',
	owner: 'jack',
	package: 'dompurify',
	reason: 'transitive via @cesium/engine; pending Phillip',
	tree: 'applications/citywatcher',
	...overrides,
});

let dir = '';

afterEach(async () => {
	if (dir) await removeTempTree(dir);
});

describe('advisory audit: holds', () => {
	test('a human hold goes stale after 30 days or past until; an upstream hold only ages', () => {
		expect(holdStatus(hold(), NOW)).toMatchObject({ ageDays: 10, stale: false });
		expect(holdStatus(hold({ date: '2026-08-01' }), NOW)).toMatchObject({
			ageDays: 66,
			stale: true,
		});
		expect(holdStatus(hold({ date: '2026-08-01', blockedOn: 'upstream' }), NOW)).toMatchObject({
			ageDays: 66,
			stale: false,
		});
		expect(holdStatus(hold({ until: '2026-10-01' }), NOW).stale).toBe(true);
		expect(
			findHold([hold()], 'applications/citywatcher', 'dompurify', 'GHSA-6688-9rhm-gjv2'),
		).toBeDefined();
		expect(
			findHold([hold()], 'applications/citywatcher', 'dompurify', 'GHSA-other'),
		).toBeUndefined();
	});

	test('readHolds accepts a missing file and rejects a malformed entry', async () => {
		dir = await testTempDir('aidd-advisory-holds-');
		expect(readHolds(join(dir, 'missing.json'))).toEqual([]);
		await writeFile(join(dir, 'good.json'), JSON.stringify([hold()]));
		expect(readHolds(join(dir, 'good.json'))).toEqual([hold()]);
		await writeFile(
			join(dir, 'bad.json'),
			JSON.stringify([{ ...hold(), blockedOn: 'whenever' }]),
		);
		expect(() => readHolds(join(dir, 'bad.json'))).toThrow('entry 0 is not a hold');
	});
});

describe('advisory audit: report', () => {
	test('new and closed are the difference between two runs; a first run closes nothing', () => {
		const before = record([
			tree('applications/aidd', {
				findings: [finding('proxy-addr', 'GHSA-jqcg-44mw-7w3h', 'critical')],
			}),
		]);
		const after = record([
			tree('applications/aidd', {
				findings: [finding('@modelcontextprotocol/sdk', 'GHSA-6qxp-vccf-f47h')],
			}),
		]);
		expect(diffRuns(after, before)).toMatchObject({
			closed: [findingKey('applications/aidd', 'proxy-addr', 'GHSA-jqcg-44mw-7w3h')],
			opened: [
				findingKey('applications/aidd', '@modelcontextprotocol/sdk', 'GHSA-6qxp-vccf-f47h'),
			],
		});
		expect(diffRuns(after, null).closed).toEqual([]);
		expect(diffRuns(after, before).unverified).toEqual([]);
	});

	// A finding whose tree is UNSWEPT or gone this run was not re-checked; calling it closed is the
	// false closure Roger reproduced on 154c0603.
	test('a previous finding in a tree that is UNSWEPT or absent now is not re-checked, not closed', () => {
		const before = record([
			tree('applications/a', { findings: [finding('left-pad', 'GHSA-aaaa-aaaa-aaaa')] }),
			tree('applications/b', { findings: [finding('right-pad', 'GHSA-bbbb-bbbb-bbbb')] }),
			tree('applications/c', { findings: [finding('mid-pad', 'GHSA-cccc-cccc-cccc')] }),
		]);
		const after = record([
			tree('applications/a', { error: 'bun audit exited 2', status: 'unswept' }),
			tree('applications/c'),
		]);
		const diff = diffRuns(after, before);
		expect(diff.closed).toEqual([
			findingKey('applications/c', 'mid-pad', 'GHSA-cccc-cccc-cccc'),
		]);
		expect(diff.unverified).toEqual([
			findingKey('applications/a', 'left-pad', 'GHSA-aaaa-aaaa-aaaa'),
			findingKey('applications/b', 'right-pad', 'GHSA-bbbb-bbbb-bbbb'),
		]);
		expect(historyLine(after, before, [], NOW, 'runs/x.json')).toContain(
			'| closed 1 | not re-checked 2 |',
		);
	});

	test('LOCK-ONLY comes first in a tree block, UNSWEPT is named in the header, holds show their age', () => {
		const current = record([
			tree('applications/deeper', {
				findings: [],
				lockOnly: [
					{
						dependent: 'postcss@8.5.28',
						linked: '1.2.1',
						locked: '1.2.2',
						package: 'source-map-js',
					},
				],
				owners: ['carl', 'jimmy'],
			}),
			tree('applications/citywatcher', {
				findings: [finding('dompurify', 'GHSA-6688-9rhm-gjv2', 'low')],
				owners: ['jack'],
			}),
			tree('applications/broken', {
				error: 'bun audit timed out after 1ms',
				status: 'unswept',
			}),
			tree('applications/keystrike', { owners: [] }),
		]);
		const report = renderReport(current, null, [hold({ date: '2026-08-01' })], NOW);
		const deeper = report.slice(
			report.indexOf('### applications/deeper'),
			report.indexOf('### applications/citywatcher'),
		);
		expect(deeper.indexOf('**LOCK-ONLY**')).toBeLessThan(deeper.indexOf('Findings:'));
		expect(deeper).toContain('bun install --frozen-lockfile');
		expect(report).toContain('UNSWEPT: applications/broken');
		expect(report).toContain('held by jack since 2026-08-01 (66 days, human) **STALE HOLD**');
		expect(report).toContain('Owner: UNOWNED');
		expect(report).toContain('No npm surface: D:\\scripts');
		expect(report).toContain('historical release artifact');
		expect(report).toContain('first run, nothing to compare');
	});

	test('the history line is written for a quiet run too, so a missing line is the alarm', () => {
		const quiet = record([tree('applications/aidd')]);
		const line = historyLine(quiet, null, [], NOW, 'runs/20261006T190000.000Z.json');
		expect(line).toBe(
			`${NOW.toISOString()} | record runs/20261006T190000.000Z.json | roots D:\\applications, D:\\scripts | trees 1 | unswept: none | lock-only: none | findings: 0 | new 0 | closed 0 | not re-checked 0 | stale holds 0 | artifacts skipped 1 | no surface: D:\\scripts`,
		);
	});
});
