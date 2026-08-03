import { describe, expect, test } from 'bun:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { resolveBashExecutable } from '../../shared/src/agent/tools/bash-runtime.ts';
import { testTempDirSync } from '../_helpers/temp.ts';

// Each case is a way a release tag could publish without its screenshot artifact. The directory
// is gitignored, so a tag that slips through is a version whose visual record is gone for good —
// v3.25.0 through v3.28.2 of the spernakit template shipped exactly that way before this guard.
const GUARD = resolve(import.meta.dir, '..', '..', '.githooks', 'screenshot-guard.sh');
const ZERO = '0'.repeat(40);
const SHA = 'a'.repeat(40);
const tmpRoot = testTempDirSync('screenshot-guard');

// Never spawn a bare `bash`: on Windows the first PATH match is often the System32 WSL shim,
// which cannot run a Windows-path script. Reuse aidd's deterministic resolution.
const bashResolution = resolveBashExecutable();
const BASH = 'path' in bashResolution ? bashResolution.path : null;

/** Runs the guard with a pre-push stdin payload; returns exit code + stderr. */
const runGuard = async (cwd: string, stdin: string): Promise<{ code: number; err: string }> => {
	if (BASH === null) throw new Error(`no usable bash: ${JSON.stringify(bashResolution)}`);
	const p = Bun.spawn([BASH, GUARD], {
		cwd,
		stdin: new TextEncoder().encode(stdin),
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	const err = await new Response(p.stderr).text();
	return { code: await p.exited, err };
};

let seq = 0;
const makeRoot = async (): Promise<string> => {
	const root = join(tmpRoot, `repo-${seq++}`);
	await mkdir(root, { recursive: true });
	return root;
};

const addScreenshots = async (root: string, dir: string, count: number): Promise<void> => {
	const target = join(root, 'screenshots', dir);
	await mkdir(target, { recursive: true });
	for (let i = 0; i < count; i++) {
		await writeFile(join(target, `page-${i}.png`), 'png\n');
	}
};

const tagLine = (tag: string, localSha = SHA): string =>
	`refs/tags/${tag} ${localSha} refs/tags/${tag} ${ZERO}\n`;

/** Mirrors what the crawl stamps into the versioned directory (scripts/crawltest-screenshots.ts). */
const addCrawlResult = async (
	root: string,
	dir: string,
	stamp: { status: string; success: boolean },
): Promise<void> => {
	await writeFile(
		join(root, 'screenshots', dir, 'crawl-result.json'),
		`${JSON.stringify({ ...stamp, timestamp: '2026-07-27T00:00:00.000Z' }, null, '\t')}\n`,
	);
};

describe('screenshot guard', () => {
	test('branch pushes are not checked', async () => {
		const root = await makeRoot();
		const r = await runGuard(root, `refs/heads/main ${SHA} refs/heads/main ${SHA}\n`);
		expect(r.code).toBe(0);
	});

	test('non-version tags are not checked', async () => {
		const root = await makeRoot();
		const r = await runGuard(root, tagLine('deploy-marker'));
		expect(r.code).toBe(0);
	});

	test('a repository with no screenshots root does not capture at all and passes', async () => {
		// A CLI or a library never grows a screenshots/ directory. Treating that as a missing
		// capture would block every tag push in every headless repository the guard ships to.
		const root = await makeRoot();
		const r = await runGuard(root, tagLine('v3.29.0'));
		expect(r.code).toBe(0);
	});

	test('once the screenshots root exists, a tag with no capture under it blocks', async () => {
		// The root is what records the opt-in. Collapsing this case together with the one above
		// reads an opted-in repository's forgotten capture as an opted-out repository.
		const root = await makeRoot();
		await mkdir(join(root, 'screenshots'), { recursive: true });
		const r = await runGuard(root, tagLine('v3.29.0'));
		expect(r.code).toBe(1);
		expect(r.err).toContain('screenshots/ exists but has no v3.29.0/ capture');
	});

	test('a nearly empty capture blocks — a crawl that died early is not an artifact', async () => {
		const root = await makeRoot();
		await addScreenshots(root, 'v3.29.0', 2);
		const r = await runGuard(root, tagLine('v3.29.0'));
		expect(r.code).toBe(1);
		expect(r.err).toContain('only 2 PNG(s)');
	});

	test('a full capture with no crawl result passes — captures predating the stamp still work', async () => {
		const root = await makeRoot();
		await addScreenshots(root, 'v3.29.0', 5);
		const r = await runGuard(root, tagLine('v3.29.0'));
		expect(r.code).toBe(0);
	});

	test('a full capture whose crawl failed blocks — PNG count alone is not a verdict', async () => {
		const root = await makeRoot();
		await addScreenshots(root, 'v3.29.0', 40);
		await addCrawlResult(root, 'v3.29.0', { status: 'failed', success: false });
		const r = await runGuard(root, tagLine('v3.29.0'));
		expect(r.code).toBe(1);
		expect(r.err).toContain("crawl status 'failed'");
	});

	test('a crawl that died mid-run leaves the started stamp and blocks', async () => {
		const root = await makeRoot();
		await addScreenshots(root, 'v3.29.0', 40);
		await addCrawlResult(root, 'v3.29.0', { status: 'started', success: false });
		const r = await runGuard(root, tagLine('v3.29.0'));
		expect(r.code).toBe(1);
		expect(r.err).toContain("crawl status 'started'");
	});

	test('a full capture with a passing crawl result passes', async () => {
		const root = await makeRoot();
		await addScreenshots(root, 'v3.29.0', 40);
		await addCrawlResult(root, 'v3.29.0', { status: 'passed', success: true });
		const r = await runGuard(root, tagLine('v3.29.0'));
		expect(r.code).toBe(0);
	});

	test('derived-app directory naming (v<app>-sv<template>) passes', async () => {
		const root = await makeRoot();
		await addScreenshots(root, 'v1.4.0-sv3.29.0', 8);
		const r = await runGuard(root, tagLine('v1.4.0'));
		expect(r.code).toBe(0);
	});

	test('tag deletion is skipped, not treated as a release', async () => {
		const root = await makeRoot();
		const r = await runGuard(root, tagLine('v3.29.0', ZERO));
		expect(r.code).toBe(0);
	});

	test('one satisfied tag does not exonerate a missing one', async () => {
		const root = await makeRoot();
		await addScreenshots(root, 'v3.29.0', 6);
		const r = await runGuard(root, tagLine('v3.29.0') + tagLine('v3.30.0'));
		expect(r.code).toBe(1);
		expect(r.err).toContain('v3.30.0');
	});

	test('guard body is invoked via `bash <path>` and needs no exec bit in the index', async () => {
		// Matches the aidd-history-guard/leak-guard convention asserted in history-guard.test.ts.
		const repoRoot = resolve(import.meta.dir, '..', '..');
		const p = Bun.spawn(['git', 'ls-files', '-s', '.githooks/screenshot-guard.sh'], {
			cwd: repoRoot,
			stdout: 'pipe',
			windowsHide: true,
		});
		const out = await new Response(p.stdout).text();
		expect(await p.exited).toBe(0);
		expect(out.split(/\s+/)[0]).toBe('100644');
	});
});
