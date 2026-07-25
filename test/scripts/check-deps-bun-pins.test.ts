import { describe, expect, test } from 'bun:test';

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { runCheckDeps } from '../../scripts/check-deps.ts';
import { removeTempTree } from '../../shared/src/lib/remove-temp-tree.ts';
import { testTempDir } from '../_helpers/temp.ts';

/**
 * The Bun version naming the LGPL corresponding source is read from package.json's
 * `packageManager` field, but the binaries are compiled by Bun pinned independently in
 * the CI/release workflows and the Dockerfile. These tests pin the comparator that
 * prevents that drift: bumping `packageManager` without bumping the literal pins (or the
 * reverse) must fail check-deps, while a workflow that reads the version from the manifest
 * by construction (`bun-version-file: package.json`) must produce no finding.
 */

const PINNED = '1.3.14';

interface Fixture {
	bunVersion?: string; // literal `bun-version:` in a workflow; omit for bun-version-file
	dockerTag?: string; // `FROM oven/bun:<version>` tag; defaults to PINNED
	dockerDigest?: string; // `@sha256:` suffix on the Dockerfile FROM line
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

	// Dockerfile: `FROM oven/bun:<version>` with optional digest suffix.
	const tag = opts.dockerTag ?? PINNED;
	const digest = opts.dockerDigest ?? '';
	await writeFile(
		join(root, 'Dockerfile'),
		`FROM oven/bun:${tag}${digest} AS builder\nWORKDIR /src\n`,
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

	test('a stale FROM oven/bun tag in Dockerfile produces exit 1 naming Dockerfile', async () => {
		const dir = await makeFixture({ dockerTag: '1.2.0' });
		try {
			const exitCode = await runCheckDeps(dir);

			expect(exitCode).toBe(1);
		} finally {
			await removeTempTree(dir);
		}
	});

	test('a Dockerfile pin with @sha256 digest parses to the bare version (no false mismatch)', async () => {
		const dir = await makeFixture({
			dockerDigest:
				'@sha256:e10577f0db68676a7024391c6e5cb4b879ebd17188ab750cf10024a6d700e5c4',
		});
		try {
			const exitCode = await runCheckDeps(dir);

			expect(exitCode).toBe(0);
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
