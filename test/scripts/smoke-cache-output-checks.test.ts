import { afterEach, describe, expect, test } from 'bun:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { stepOutputsExist } from '../../scripts/lib/smoke-cache/outputs.ts';
import { writeAcceptedAnalysis } from '../_helpers/bundle-analysis.ts';
import { testTempDir } from '../_helpers/temp.ts';

// build:analyze passes only when check:bundle-analysis accepts its report, and nothing in the
// cache key reads the report, so a corrupt, empty or stale one with unchanged inputs used to
// replay a pass the step would now fail (roger, review of 04079824).

const savedRevision = process.env['AIDD_BUILD_REVISION'];

afterEach(() => {
	if (savedRevision === undefined) delete process.env['AIDD_BUILD_REVISION'];
	else process.env['AIDD_BUILD_REVISION'] = savedRevision;
});

async function analysisFixture(overrides: { html?: string; json?: string } = {}): Promise<string> {
	process.env['AIDD_BUILD_REVISION'] = 'abcdef12';
	const root = await testTempDir('aidd-smoke-output-checks-');
	await mkdir(join(root, 'frontend', 'dist', 'assets'), { recursive: true });
	await writeFile(join(root, 'frontend', 'dist', 'assets', 'index.js'), 'export const x = 1;\n');
	await writeAcceptedAnalysis(root, overrides);
	return root;
}

describe('build:analyze replays a pass only over a report its check would accept', () => {
	test('a valid report at the current revision allows the cache hit', async () => {
		expect(await stepOutputsExist(await analysisFixture(), 'build:analyze')).toBe(true);
	});

	test('an empty report file withholds it', async () => {
		const root = await analysisFixture({ html: '' });
		expect(await stepOutputsExist(root, 'build:analyze')).toBe(false);
	});

	test('a corrupt report withholds it', async () => {
		const root = await analysisFixture({ json: '{"chunks": [' });
		expect(await stepOutputsExist(root, 'build:analyze')).toBe(false);
	});

	test('a report from another revision withholds it', async () => {
		const root = await analysisFixture();
		process.env['AIDD_BUILD_REVISION'] = '12345678';
		expect(await stepOutputsExist(root, 'build:analyze')).toBe(false);
	});
});
