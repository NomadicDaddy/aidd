import { afterEach, describe, expect, test } from 'bun:test';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describeScope, formatRow } from '../../scripts/lib/advisory-sweep/row.ts';
import { runSweep, selectRoots } from '../../scripts/advisory-sweep.ts';
import { testTempDir } from '../_helpers/temp.ts';
import { removeTempTree } from '../backend/_helpers/remove-temp-tree.ts';

// Phillip's #8053 rule: a sweep covers every repo-holding root or names the ones it skipped and why.
// --root replaces the defaults, so a narrowed sweep has to carry the roots it left out, in the row
// when it read something and in its failure output when it read nothing.

const roots: string[] = [];
afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => removeTempTree(root)));
});

async function tempRoot(prefix: string): Promise<string> {
	const root = await testTempDir(prefix);
	roots.push(root);
	return root;
}

const SKIPPED = '(not selected by --root)';
const script = join(import.meta.dir, '..', '..', 'scripts', 'advisory-sweep.ts');

describe('advisory sweep scope', () => {
	// Roger on d7885b7f: the row named only what a narrowed sweep read.
	test('a narrowed sweep names each default root it skipped, and a default one names none', async () => {
		expect(selectRoots(undefined).skipped).toEqual([]);
		const narrowed = selectRoots(['d:\\APPLICATIONS']);
		expect(narrowed.skipped.map((s) => s.root)).toEqual([
			'D:\\amiga',
			'D:\\infra',
			'D:\\scripts',
		]);
		const root = await tempRoot('aidd-advisory-scope-');
		await writeFile(
			join(root, 'package.json'),
			JSON.stringify({ dependencies: { x: '1.0.0' } }),
		);
		const result = await runSweep({
			control: 'x',
			date: '2026-10-08',
			packages: [],
			query: 'q',
			roots: [root],
			skipped: narrowed.skipped,
			toolCheck: 'did not apply',
		});
		expect(formatRow(result)).toContain(
			`roots: ${root} 1 files; skipped D:\\amiga ${SKIPPED}, D:\\infra ${SKIPPED}, ` +
				`D:\\scripts ${SKIPPED} |`,
		);
		expect(formatRow({ ...result, skipped: [] })).not.toContain('skipped');
	});

	// Roger on 8431f2e4: one that read nothing printed only the FAILED row, losing why its roots
	// yielded nothing and which default roots it skipped.
	test('a narrowed sweep that read nothing still prints its scope and appends nothing', async () => {
		const empty = await tempRoot('aidd-advisory-scope-empty-');
		const absent = join(empty, 'absent');
		const result = await runSweep({
			control: 'x',
			date: '2026-10-08',
			packages: [],
			query: 'q',
			roots: [empty, absent],
			skipped: selectRoots([empty, absent]).skipped,
			toolCheck: 'did not apply',
		});
		expect(formatRow(result)).toBe('2026-10-08 | FAILED: 0 files scanned');
		expect(describeScope(result)).toBe(
			`${empty} no npm surface + ${absent} UNSWEPT (root not readable); skipped ` +
				`D:\\amiga ${SKIPPED}, D:\\applications ${SKIPPED}, D:\\infra ${SKIPPED}, ` +
				`D:\\scripts ${SKIPPED}`,
		);

		const sweepsFile = join(empty, 'sweeps.md');
		const args = ['--query', 'q', '--root', empty, '--append', '--sweeps-file', sweepsFile];
		const run = Bun.spawnSync([process.execPath, script, ...args], {
			stderr: 'pipe',
			stdout: 'pipe',
		});
		expect(run.exitCode).toBe(1);
		expect(run.stderr.toString()).toContain(
			`Scope: ${empty} no npm surface; skipped D:\\amiga ${SKIPPED}`,
		);
		expect(await Bun.file(sweepsFile).exists()).toBe(false);
	});
});
