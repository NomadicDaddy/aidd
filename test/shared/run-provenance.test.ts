import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';

import type { AiddGitProbe } from '../../shared/src/run-provenance.ts';

import {
	parseAiddRunProvenance,
	readAiddVersion,
	resolveAiddRunProvenance,
} from '../../shared/src/run-provenance.ts';
import { testTempDir } from '../_helpers/temp.ts';
import { removeTempTree } from '../../shared/src/lib/remove-temp-tree.ts';

function gitProbe(input: { dirty?: boolean; revision?: null | string }): AiddGitProbe {
	return async (args) => {
		if (args[0] === 'rev-parse') {
			return input.revision
				? { exitCode: 0, stdout: `${input.revision}\n` }
				: { exitCode: 1, stdout: '' };
		}
		return { exitCode: 0, stdout: input.dirty ? ' M shared/src/run-provenance.ts\n' : '' };
	};
}

describe('aidd run provenance', () => {
	test('normalizes missing fields and rejects malformed provenance', () => {
		expect(parseAiddRunProvenance({})).toEqual({
			aiddDirty: null,
			aiddRevision: null,
			aiddVersion: null,
		});
		expect(parseAiddRunProvenance({ aiddDirty: 'yes' })).toBeUndefined();
		expect(parseAiddRunProvenance({ aiddRevision: 123 })).toBeUndefined();
		expect(parseAiddRunProvenance({ aiddVersion: false })).toBeUndefined();
	});

	test('reads the canonical version and captures a clean checkout revision', async () => {
		const rootDir = await testTempDir('aidd-run-provenance-clean-');
		try {
			await Bun.write(join(rootDir, 'VERSION'), '2.125.0\n');
			const provenance = await resolveAiddRunProvenance(
				rootDir,
				gitProbe({ revision: '0123456789abcdef' }),
			);
			expect(provenance).toEqual({
				aiddDirty: false,
				aiddRevision: '0123456789abcdef',
				aiddVersion: '2.125.0',
			});
		} finally {
			await removeTempTree(rootDir);
		}
	});

	test('captures dirty state without persisting changed paths', async () => {
		const rootDir = await testTempDir('aidd-run-provenance-dirty-');
		try {
			await Bun.write(join(rootDir, 'VERSION'), '2.125.0\n');
			expect(
				await resolveAiddRunProvenance(
					rootDir,
					gitProbe({ dirty: true, revision: 'fedcba9876543210' }),
				),
			).toEqual({
				aiddDirty: true,
				aiddRevision: 'fedcba9876543210',
				aiddVersion: '2.125.0',
			});
		} finally {
			await removeTempTree(rootDir);
		}
	});

	test('keeps packaged builds honest when git metadata is unavailable', async () => {
		const rootDir = await testTempDir('aidd-run-provenance-package-');
		try {
			await mkdir(rootDir, { recursive: true });
			await Bun.write(join(rootDir, 'VERSION'), '2.125.0\n');
			expect(await resolveAiddRunProvenance(rootDir, gitProbe({ revision: null }))).toEqual({
				aiddDirty: null,
				aiddRevision: null,
				aiddVersion: '2.125.0',
			});
		} finally {
			await removeTempTree(rootDir);
		}
	});

	test('returns null for a missing or blank VERSION asset', async () => {
		const rootDir = await testTempDir('aidd-run-provenance-version-');
		try {
			expect(await readAiddVersion(rootDir)).toBeNull();
			await Bun.write(join(rootDir, 'VERSION'), '   \n');
			expect(await readAiddVersion(rootDir)).toBeNull();
		} finally {
			await removeTempTree(rootDir);
		}
	});
});
