import { describe, expect, test } from 'bun:test';
import { copyFileSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { beginReleaseCapture, finishReleaseCapture } from '../../scripts/lib/release-capture.ts';
import { sha256 } from '../../scripts/lib/release-build.ts';
import { resolveBashExecutable } from '../../shared/src/agent/tools/bash-runtime.ts';
import { fixtureGit, releaseFixture } from '../_helpers/release-capture.ts';

const GUARD = resolve(import.meta.dir, '../../.githooks/screenshot-guard.sh');
const ZERO = '0'.repeat(40);
const bash = resolveBashExecutable();

async function runGuard(root: string, commit: string, ref = 'refs/tags/v1.0.0') {
	if (!('path' in bash)) throw new Error('Git Bash is unavailable.');
	const child = Bun.spawn([bash.path, GUARD], {
		cwd: root,
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
		stdin: new TextEncoder().encode(`${ref} ${commit} ${ref} ${ZERO}\n`),
	});
	const err = await new Response(child.stderr).text();
	return { code: await child.exited, err };
}

interface Manifest {
	analyzer: { failures: string[]; reportSha256: string; success: boolean };
	build: { mode: string; source: { clean: boolean; commit: string; tree: string } };
	candidate: { clean: boolean; commit: string; tree: string };
	images: { file: string; route: string; sha256: string }[];
	reportSha256: string;
	routes: string[];
	run: string;
	scope: {
		check404: boolean;
		page: null | string;
		startFrom: null | string;
		viewport: { height: number; width: number };
	};
	status: string;
	success: boolean;
}

describe('release screenshot guard', () => {
	test('recognizes aidd runtime HTML injection while rejecting changed production HTML', async () => {
		const fixture = await releaseFixture(
			true,
			(html) => `<meta name="aidd-trace-default" content="false" />${html}`,
		);
		expect((await runGuard(fixture.root, fixture.source.commit)).code).toBe(0);
		await expect(
			releaseFixture(true, (html) => `${html}<script>changed()</script>`),
		).rejects.toThrow('Production asset differs');
	});
	test('accepts the real producer output for matching lightweight and annotated tag objects', async () => {
		const fixture = await releaseFixture();
		expect(await runGuard(fixture.root, fixture.source.commit)).toMatchObject({ code: 0 });
		fixtureGit(fixture.root, 'tag', '-a', 'v1.0.0', '-m', 'Fixture release');
		expect(
			await runGuard(fixture.root, fixtureGit(fixture.root, 'rev-parse', 'v1.0.0')),
		).toMatchObject({ code: 0 });
	});

	test('uses the tagged declaration even when deleted from the working directory', async () => {
		const fixture = await releaseFixture();
		unlinkSync(join(fixture.root, '.screenshot-capture'));
		unlinkSync(fixture.manifestPath);
		expect((await runGuard(fixture.root, fixture.source.commit)).code).toBe(1);
	});

	test('historical trees without the declaration remain exempt despite current local opt-in', async () => {
		const fixture = await releaseFixture(false);
		expect(await runGuard(fixture.root, fixture.source.commit)).toMatchObject({ code: 0 });
	});

	test('skips branch pushes and tag deletion', async () => {
		const fixture = await releaseFixture();
		unlinkSync(fixture.manifestPath);
		expect((await runGuard(fixture.root, fixture.source.commit, 'refs/heads/main')).code).toBe(
			0,
		);
		expect((await runGuard(fixture.root, ZERO)).code).toBe(0);
	});

	const mutations: [string, (manifest: Manifest) => void][] = [
		[
			'started',
			(manifest) => {
				manifest.status = 'started';
			},
		],
		[
			'failed',
			(manifest) => {
				manifest.success = false;
			},
		],
		[
			'narrow page',
			(manifest) => {
				manifest.scope.page = '/one';
			},
		],
		[
			'narrow prefix',
			(manifest) => {
				manifest.scope.startFrom = '/one';
			},
		],
		[
			'missing 404 check',
			(manifest) => {
				manifest.scope.check404 = false;
			},
		],
		[
			'wrong viewport',
			(manifest) => {
				manifest.scope.viewport.width = 1440;
			},
		],
		[
			'wrong candidate',
			(manifest) => {
				manifest.candidate.commit = ZERO;
			},
		],
		[
			'wrong tree',
			(manifest) => {
				manifest.candidate.tree = ZERO;
			},
		],
		[
			'dirty candidate',
			(manifest) => {
				manifest.candidate.clean = false;
			},
		],
		[
			'development build',
			(manifest) => {
				manifest.build.mode = 'development';
			},
		],
		[
			'wrong build',
			(manifest) => {
				manifest.build.source.commit = ZERO;
			},
		],
		[
			'failed analyzer',
			(manifest) => {
				manifest.analyzer.success = false;
			},
		],
		[
			'analyzer from another report',
			(manifest) => {
				manifest.analyzer.reportSha256 = ZERO;
			},
		],
		[
			'incomplete route coverage',
			(manifest) => {
				manifest.routes.pop();
			},
		],
		[
			'incomplete image inventory',
			(manifest) => {
				manifest.images.pop();
			},
		],
		[
			'image path escape',
			(manifest) => {
				manifest.images[0]!.file = '../one.png';
			},
		],
		[
			'wrong run identity',
			(manifest) => {
				manifest.run = ZERO;
			},
		],
	];
	for (const [name, mutate] of mutations) {
		test(`rejects ${name}`, async () => {
			const fixture = await releaseFixture();
			const manifest = JSON.parse(readFileSync(fixture.manifestPath, 'utf8')) as Manifest;
			mutate(manifest);
			writeFileSync(fixture.manifestPath, JSON.stringify(manifest));
			expect((await runGuard(fixture.root, fixture.source.commit)).code).toBe(1);
		});
	}

	for (const file of ['crawl-result.json', 'report.json', 'one.png']) {
		test(`rejects missing ${file}`, async () => {
			const fixture = await releaseFixture();
			unlinkSync(join(fixture.capture.directory, file));
			expect((await runGuard(fixture.root, fixture.source.commit)).code).toBe(1);
		});
	}

	for (const file of ['crawl-result.json', 'report.json', 'one.png', 'extra.png']) {
		test(`rejects changed or unexpected ${file}`, async () => {
			const fixture = await releaseFixture();
			writeFileSync(join(fixture.capture.directory, file), 'invalid');
			expect((await runGuard(fixture.root, fixture.source.commit)).code).toBe(1);
		});
	}

	test('a diagnostic capture cannot replace the authoritative full attempt', async () => {
		const fixture = await releaseFixture();
		const full = beginReleaseCapture(fixture.root, fixture.versionDirectory, fixture.scope);
		const narrow = beginReleaseCapture(fixture.root, fixture.versionDirectory, {
			...fixture.scope,
			page: '/one',
		});
		expect(narrow.directory).not.toBe(full.directory);
		copyFileSync(join(fixture.capture.directory, 'one.png'), join(narrow.directory, 'one.png'));
		expect(
			await finishReleaseCapture(
				fixture.root,
				'http://127.0.0.1',
				narrow,
				{
					summary: { screenshotsTaken: 1, success: true },
					visitedUrls: ['http://127.0.0.1/one'],
				},
				[],
				[{ file: 'one.png', route: '/one' }],
				null,
			),
		).toBe(true);
		expect(
			JSON.parse(readFileSync(join(narrow.directory, 'crawl-result.json'), 'utf8')),
		).toMatchObject({ status: 'diagnostic', success: false });
		expect(
			JSON.parse(readFileSync(join(fixture.versionDirectory, 'release-run.json'), 'utf8')),
		).toEqual({ run: full.run });
		expect((await runGuard(fixture.root, fixture.source.commit)).code).toBe(1);
		expect(readFileSync(fixture.manifestPath, 'utf8')).toContain('"passed"');
	});

	test('accepts the derived application version directory', async () => {
		const fixture = await releaseFixture();
		renameSync(fixture.versionDirectory, `${fixture.versionDirectory}-sv3.0.0`);
		expect((await runGuard(fixture.root, fixture.source.commit)).code).toBe(0);
	});

	test('rejects missing required routes even when the report and manifest agree', async () => {
		const fixture = await releaseFixture();
		const manifest = JSON.parse(readFileSync(fixture.manifestPath, 'utf8')) as Manifest;
		const reportPath = join(fixture.capture.directory, 'report.json');
		const report = JSON.parse(readFileSync(reportPath, 'utf8')) as { visitedUrls: string[] };
		report.visitedUrls.pop();
		manifest.routes.pop();
		const text = JSON.stringify(report);
		manifest.reportSha256 = sha256(text);
		manifest.analyzer.reportSha256 = sha256(text);
		writeFileSync(reportPath, text);
		writeFileSync(fixture.manifestPath, JSON.stringify(manifest));
		expect(await runGuard(fixture.root, fixture.source.commit)).toMatchObject({
			code: 1,
			err: expect.stringContaining('Missing expected route'),
		});
	});

	test('historical opt-ins do not fall back to counting unverified PNGs', async () => {
		const fixture = await releaseFixture();
		writeFileSync(
			join(fixture.root, '.screenshot-capture'),
			'# Historical capture declaration\n',
		);
		fixtureGit(fixture.root, 'add', '.screenshot-capture');
		fixtureGit(fixture.root, 'commit', '--quiet', '-m', 'Historical opt-in fixture');
		expect(
			(await runGuard(fixture.root, fixtureGit(fixture.root, 'rev-parse', 'HEAD'))).code,
		).toBe(1);
	});
});
