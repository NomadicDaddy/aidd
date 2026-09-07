import { describe, expect, test } from 'bun:test';

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
	BAD_REVISION_MESSAGE,
	NO_REVISION_MESSAGE,
	readBuildRevision,
	REVISION_EXPORT_FILE,
} from '../../frontend/buildRevision.ts';
import { removeTempTree } from '../../shared/src/lib/remove-temp-tree.ts';
import { testTempDir } from '../_helpers/temp.ts';

const frontendDir = join(process.cwd(), 'frontend');

const HEAD = execFileSync('git', ['rev-parse', '--verify', 'HEAD'], {
	cwd: process.cwd(),
	encoding: 'utf8',
}).trim();

/**
 * The `frontend/` of an unpacked release archive: no `.git` anywhere above it, so Git cannot
 * answer. The temp root lives under the OS temp directory, outside this checkout and outside any
 * repository, which is what makes the Git lookup fail the way it does in a real archive.
 */
async function withExportedTree(run: (root: string) => Promise<void>): Promise<void> {
	const root = await testTempDir('aidd-build-revision-');
	try {
		await run(root);
	} finally {
		await removeTempTree(root);
	}
}

describe('frontend build revision', () => {
	test('the override wins over the Git checkout it is run in', () => {
		expect(readBuildRevision(frontendDir, { AIDD_BUILD_REVISION: 'ABCDEF1234567890' })).toBe(
			'abcdef12',
		);
	});

	test('rejects an override that is not a hexadecimal revision', () => {
		expect(() => readBuildRevision(frontendDir, { AIDD_BUILD_REVISION: 'v3.0.0' })).toThrow(
			BAD_REVISION_MESSAGE,
		);
	});

	test('reads HEAD in a Git checkout', () => {
		expect(readBuildRevision(frontendDir, {})).toBe(HEAD.slice(0, 8).toLowerCase());
	});

	test('ignores the unsubstituted placeholder this checkout carries', () => {
		// The tracked file is present here and still holds `$Format:%H$`; Git answers first.
		expect(readFileSync(join(frontendDir, REVISION_EXPORT_FILE), 'utf8').trim()).toBe(
			'$Format:%H$',
		);
	});

	test('falls back to the substituted export file when there is no Git', async () => {
		await withExportedTree(async (root) => {
			// What `export-subst` writes into the archive: the full commit the tag was cut from.
			writeFileSync(join(root, REVISION_EXPORT_FILE), `${HEAD}\n`);

			expect(readBuildRevision(root, {})).toBe(HEAD.slice(0, 8).toLowerCase());
			await Promise.resolve();
		});
	});

	test('ignores the unsubstituted placeholder a plain checkout carries', async () => {
		await withExportedTree(async (root) => {
			writeFileSync(join(root, REVISION_EXPORT_FILE), '$Format:%H$\n');

			expect(() => readBuildRevision(root, {})).toThrow(NO_REVISION_MESSAGE);
			await Promise.resolve();
		});
	});

	test('throws when no source can answer', async () => {
		await withExportedTree(async (root) => {
			expect(() => readBuildRevision(root, {})).toThrow(NO_REVISION_MESSAGE);
			await Promise.resolve();
		});
	});
});
