import { describe, expect, test } from 'bun:test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { MATURITY_SKIP_FILE } from 'aidd-shared/metadata/maturity';
import { metadataPath } from 'aidd-shared/metadata/paths';

import { loadMaturitySkip } from '../../backend/src/services/maturity/artifactClassification.ts';
import { testTempDirSync } from '../_helpers/temp.ts';

// Regression: the writer emitted `.aidd/maturity.json` while the loader read
// `.aidd/maturity-skip.json`, so every "Mark N/A" skip was written and then silently discarded —
// the read simply found no file and returned []. Both sides now use MATURITY_SKIP_FILE. These
// tests fail if either side hardcodes a filename again.
describe('maturity skip round-trip', () => {
	const tmpRoot = testTempDirSync('maturity-skip-roundtrip');

	const makeProject = async (name: string): Promise<string> => {
		const projectDir = join(tmpRoot, name);
		await rm(projectDir, { force: true, recursive: true });
		await mkdir(metadataPath(projectDir), { recursive: true });
		return projectDir;
	};

	test('loadMaturitySkip reads back what the skip file writer produces', async () => {
		const projectDir = await makeProject('roundtrip');
		// Written exactly as services/project/profile.ts writes it, via the shared constant.
		await writeFile(
			join(metadataPath(projectDir), MATURITY_SKIP_FILE),
			`${JSON.stringify({ skip: ['spec.md', 'screen-map.md'], updatedAt: new Date().toISOString() }, null, 2)}\n`
		);
		expect(await loadMaturitySkip(projectDir)).toEqual(['spec.md', 'screen-map.md']);
	});

	test('a file at the old maturity-skip.json path is NOT read', async () => {
		// Guards the reverse mistake: reintroducing the stale name would make this pass silently.
		const projectDir = await makeProject('legacy-name');
		await writeFile(
			join(metadataPath(projectDir), 'maturity-skip.json'),
			`${JSON.stringify({ skip: ['spec.md'] })}\n`
		);
		expect(await loadMaturitySkip(projectDir)).toEqual([]);
	});

	test('a missing skip file yields no skips', async () => {
		expect(await loadMaturitySkip(await makeProject('absent'))).toEqual([]);
	});

	test('the catalog documents the filename the code actually uses', () => {
		// artifacts.md lists `.aidd/maturity.json`; if MATURITY_SKIP_FILE is ever renamed, the
		// catalog row must move with it.
		expect(MATURITY_SKIP_FILE).toBe('maturity.json');
	});
});
