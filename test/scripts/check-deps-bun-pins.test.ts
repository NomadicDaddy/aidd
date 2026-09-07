import { describe, expect, test } from 'bun:test';

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { runCheckDeps } from '../../scripts/check-deps.ts';
import { removeTempTree } from '../../shared/src/lib/remove-temp-tree.ts';
import { testTempDir } from '../_helpers/temp.ts';

/**
 * aidd ships as source, so package.json's `packageManager` field names the one Bun everybody
 * runs -- contributors, downloaders, and `scripts/require-bun.ts` at install time. A CI workflow
 * that pins a Bun literal independently would prove the gate against a different runtime. These
 * tests pin the comparator that prevents that drift: bumping `packageManager` without bumping the
 * literal pin (or the reverse) must fail check-deps, while a workflow that reads the version from
 * the manifest by construction (`bun-version-file: package.json`) must produce no finding.
 */

const PINNED = '1.3.14';

interface Fixture {
	bunVersion?: string; // literal `bun-version:` in a workflow; omit for bun-version-file
}

async function makeFixture(opts: Fixture = {}): Promise<string> {
	const root = await testTempDir('check-deps-bun-pins-');

	// Minimal package.json with a packageManager pin.
	await writeFile(
		join(root, 'package.json'),
		`${JSON.stringify({ name: 'fixture', packageManager: `bun@${PINNED}` })}\n`,
	);
	// An empty lockfile satisfies the lockfile-presence gate.
	await writeFile(join(root, 'bun.lock'), '{}\n');

	// Workflow: either a literal `bun-version:` or a `bun-version-file: package.json`.
	await mkdir(join(root, '.github', 'workflows'), { recursive: true });
	const bunVersionLine =
		opts.bunVersion !== undefined
			? `                  bun-version: ${opts.bunVersion}\n`
			: `                  bun-version-file: package.json\n`;
	await writeFile(
		join(root, '.github', 'workflows', 'release.yml'),
		`name: Release\njobs:\n  build:\n    steps:\n` +
			`      - uses: oven-sh/setup-bun@v2\n        with:\n${bunVersionLine}`,
	);

	return root;
}

describe('check-deps bun-pin drift comparator', () => {
	test('all pins agreeing produces exit 0 with no bun-pin error', async () => {
		const dir = await makeFixture();
		try {
			const exitCode = await runCheckDeps(dir);
			expect(exitCode).toBe(0);
		} finally {
			await removeTempTree(dir);
		}
	});

	test('a stale bun-version in release.yml produces exit 1 naming release.yml', async () => {
		const dir = await makeFixture({ bunVersion: '1.2.0' });
		try {
			const exitCode = await runCheckDeps(dir);

			expect(exitCode).toBe(1);
		} finally {
			await removeTempTree(dir);
		}
	});

	test('a workflow using bun-version-file with no literal pin produces no bun-pin finding', async () => {
		const dir = await makeFixture();
		try {
			const exitCode = await runCheckDeps(dir);

			expect(exitCode).toBe(0);
		} finally {
			await removeTempTree(dir);
		}
	});
});
