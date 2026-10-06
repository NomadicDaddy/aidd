import { afterEach, describe, expect, test } from 'bun:test';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { CommandOutput } from '../../scripts/lib/advisory-audit/audit.ts';
import type { RunRecord } from '../../scripts/lib/advisory-audit/types.ts';

import { runAdvisoryAudit } from '../../scripts/advisory-audit.ts';
import { removeTempTree } from '../../shared/src/lib/remove-temp-tree.ts';
import { testTempDir } from '../_helpers/temp.ts';

const LOCK = [
	'{',
	'  "packages": {',
	'    "postcss": ["postcss@8.5.28", "", { "dependencies": { "source-map-js": "^1.2.1" } }, "sha512-a"],',
	'    "source-map-js": ["source-map-js@1.2.2", "", {}, "sha512-d"],',
	'  }',
	'}',
].join('\n');

const FINDING = JSON.stringify({
	'source-map-js': [
		{
			severity: 'high',
			title: 'event-loop denial of service',
			url: 'https://github.com/advisories/GHSA-68fv-2mgg-jv7q',
			vulnerable_versions: '>=1.0.0 <1.2.2',
		},
	],
});

const output = (stdout: string, exitCode: number): CommandOutput => ({
	exitCode,
	stderr: '',
	stdout,
	timedOut: false,
});

let base = '';

afterEach(async () => {
	if (base) await removeTempTree(base);
});

async function latestRecord(out: string): Promise<RunRecord> {
	const names = (await readdir(join(out, 'runs'))).sort();
	return JSON.parse(await readFile(join(out, 'runs', names.at(-1) ?? ''), 'utf8')) as RunRecord;
}

// Roger's review of 154c0603 reproduced four ways the record could read clean when it was not;
// each is a case here, driven through the real run with an injected audit command.
describe('advisory audit run', () => {
	test('a LOCK-ONLY store stays reported after the audit goes clean, until the store is reinstalled', async () => {
		base = await testTempDir('aidd-advisory-run-');
		const root = join(base, 'root');
		const tree = join(root, 'app');
		const out = join(base, 'out');
		await mkdir(tree, { recursive: true });
		await writeFile(join(tree, 'bun.lock'), LOCK);
		const linked = join(
			tree,
			'node_modules',
			'.bun',
			'postcss@8.5.28',
			'node_modules',
			'source-map-js',
		);
		await mkdir(linked, { recursive: true });
		await writeFile(join(linked, 'package.json'), JSON.stringify({ version: '1.2.1' }));
		const common = { ignored: new Set<string>(), out, roots: [root], timeoutMs: 10 };

		// Run 1: the audit names the package and the store links the old version.
		expect(
			await runAdvisoryAudit({
				...common,
				now: new Date('2026-10-06T19:00:00Z'),
				runner: () => Promise.resolve(output(FINDING, 1)),
			}),
		).toBe(0);
		const first = await latestRecord(out);
		expect(first.trees[0]?.lockOnly.map((l) => l.package)).toEqual(['source-map-js']);

		// Run 2: the lock moved and the audit is clean, but nothing was reinstalled.
		expect(
			await runAdvisoryAudit({
				...common,
				now: new Date('2026-10-06T20:00:00Z'),
				runner: () => Promise.resolve(output('{}', 0)),
			}),
		).toBe(0);
		const second = await latestRecord(out);
		expect(second.trees[0]?.findings).toEqual([]);
		expect(second.trees[0]?.lockOnly.map((l) => l.package)).toEqual(['source-map-js']);
		expect(await readFile(join(out, 'latest.md'), 'utf8')).toContain(
			'**LOCK-ONLY**: source-map-js',
		);
		expect((await readFile(join(out, 'history.md'), 'utf8')).trim().split('\n')).toHaveLength(
			2,
		);
	});

	test('an unreadable root and a failed audit are UNSWEPT and exit 1, and close nothing', async () => {
		base = await testTempDir('aidd-advisory-run-unswept-');
		const root = join(base, 'root');
		const tree = join(root, 'app');
		const out = join(base, 'out');
		await mkdir(tree, { recursive: true });
		await writeFile(join(tree, 'bun.lock'), LOCK);
		const common = { ignored: new Set<string>(), out, timeoutMs: 10 };

		expect(
			await runAdvisoryAudit({
				...common,
				now: new Date('2026-10-06T19:00:00Z'),
				roots: [root],
				runner: () => Promise.resolve(output(FINDING, 1)),
			}),
		).toBe(0);

		// A configured root that does not exist is not "no npm surface".
		const missing = join(base, 'no-such-root');
		expect(
			await runAdvisoryAudit({
				...common,
				now: new Date('2026-10-06T20:00:00Z'),
				roots: [root, missing],
				runner: () => Promise.resolve(output('{}', 2)),
			}),
		).toBe(1);
		const record = await latestRecord(out);
		expect(record.missingRoots).toEqual([missing]);
		expect(record.noSurface).toEqual([]);
		expect(record.trees[0]?.status).toBe('unswept');
		expect(record.trees[0]?.error).toContain('exited 2');
		const report = await readFile(join(out, 'latest.md'), 'utf8');
		expect(report).toContain(`UNSWEPT: ${missing} (root unreadable), `);
		// The previous finding's tree is UNSWEPT now, so the finding is not re-checked, not closed.
		expect(report).toContain('## Closed since last report\n\nnone');
		expect(report).toContain('## Not re-checked (tree UNSWEPT or absent this run)\n\n- ');
	});

	// Roger (a430667b): second-resolution stamps let a same-second run overwrite the record its
	// history line pointed at. The name is reserved exclusively, so two runs keep two records.
	test('two runs in the same millisecond keep two records, each named by its own history line', async () => {
		base = await testTempDir('aidd-advisory-run-stamp-');
		const root = join(base, 'root');
		const out = join(base, 'out');
		await mkdir(join(root, 'app'), { recursive: true });
		await writeFile(join(root, 'app', 'bun.lock'), LOCK);
		const run = () =>
			runAdvisoryAudit({
				ignored: new Set<string>(),
				now: new Date('2026-10-06T19:00:00.000Z'),
				out,
				roots: [root],
				runner: () => Promise.resolve(output('{}', 0)),
				timeoutMs: 10,
			});
		expect(await run()).toBe(0);
		expect(await run()).toBe(0);
		expect((await readdir(join(out, 'runs'))).sort()).toEqual([
			'20261006T190000.000Z-1.json',
			'20261006T190000.000Z.json',
		]);
		const lines = (await readFile(join(out, 'history.md'), 'utf8')).trim().split('\n');
		expect(lines).toHaveLength(2);
		expect(lines[0]).toContain(`| record runs/20261006T190000.000Z.json | roots ${root} |`);
		expect(lines[1]).toContain('| record runs/20261006T190000.000Z-1.json |');
	});
});
