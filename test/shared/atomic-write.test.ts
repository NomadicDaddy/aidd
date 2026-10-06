import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import * as fsPromises from 'node:fs/promises';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { writeFileAtomic } from '../../shared/src/lib/atomicWrite.ts';
import { FileAiddStore } from '../../shared/src/metadata/store.ts';
import { testTempDir } from '../_helpers/temp.ts';
import { removeTempTree } from '../backend/_helpers/remove-temp-tree.ts';

// roadmap.json and feature.json were rewritten in place: truncated, then written. A reader in that
// window (the web panel, the roadmap gate, a concurrent run) parsed an empty or partial file, and a
// write cut short by a crash left one behind for good.

const roots: string[] = [];

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => removeTempTree(root)));
});

async function tempRoot(): Promise<string> {
	const root = await testTempDir('aidd-atomic-write-');
	roots.push(root);
	return root;
}

describe('atomic metadata writes', () => {
	test('a reader never sees a torn roadmap while it is rewritten', async () => {
		const root = await tempRoot();
		await mkdir(join(root, '.aidd'), { recursive: true });
		const store = new FileAiddStore(root);
		const small = { features: {}, milestones: { MVP: {} } };
		const large = {
			features: Object.fromEntries(
				Array.from({ length: 3000 }, (_, i) => [`feature-${i}`, { milestone: 'MVP' }]),
			),
			milestones: { MVP: {} },
		};
		await store.writeRoadmap(large);
		const path = join(root, '.aidd', 'roadmap.json');
		let writing = true;
		let reads = 0;
		const torn: string[] = [];
		// The reader yields between reads, as the panel and the gates do. One that never let go of the
		// file would hold off every rename on Windows until the writer gave up and failed the write.
		const reader = (async () => {
			while (writing) {
				const raw = await readFile(path, 'utf8');
				reads += 1;
				try {
					JSON.parse(raw);
				} catch {
					torn.push(raw.slice(0, 40));
				}
				await Bun.sleep(1);
			}
		})();
		try {
			for (let i = 0; i < 100; i++) await store.writeRoadmap(i % 2 === 0 ? small : large);
		} finally {
			writing = false;
			await reader;
		}

		expect(reads).toBeGreaterThan(0);
		expect(torn).toEqual([]);
	});

	test('a write that cannot land leaves no temp file behind', async () => {
		const root = await tempRoot();
		// A directory where the file should go makes the final rename fail.
		const target = join(root, 'occupied');
		await mkdir(target);

		await expect(writeFileAtomic(target, 'content')).rejects.toThrow();
		expect(await readdir(root)).toEqual(['occupied']);
	});

	// Windows can hold a target past every retry. Writing it in place then would reopen the very
	// truncate-then-write window the temp file closes, so the write fails and the old file stays.
	test('a target held past every retry keeps its old content and fails the write', async () => {
		const root = await tempRoot();
		const target = join(root, 'roadmap.json');
		await writeFile(target, '{"old":true}\n');
		const held = Object.assign(new Error('EPERM: operation not permitted, rename'), {
			code: 'EPERM',
		});
		const rename = spyOn(fsPromises, 'rename').mockImplementation(() => Promise.reject(held));
		try {
			await expect(writeFileAtomic(target, '{"new":true}\n')).rejects.toThrow('EPERM');
			expect(rename.mock.calls.length).toBeGreaterThan(1);
		} finally {
			rename.mockRestore();
		}

		expect(await readFile(target, 'utf8')).toBe('{"old":true}\n');
		expect(await readdir(root)).toEqual(['roadmap.json']);
	}, 10_000);
});
