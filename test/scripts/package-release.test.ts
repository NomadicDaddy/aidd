import { afterEach, describe, expect, test } from 'bun:test';

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

import {
	ALL_TARGETS,
	getRequiredDistributionEntries,
	resolveTargetOutDir,
	type CommandRunner,
} from '../../scripts/build-standalone.ts';
import { PUBLIC_DOC_ASSETS } from '../../scripts/lib/release/common.ts';
import { packageRelease, parsePackageReleaseArgs } from '../../scripts/package-release.ts';

import { testTempDir } from '../_helpers/temp.ts';
const tmpRoots: string[] = [];

function windowsTarget() {
	const target = ALL_TARGETS.find((item) => item.name === 'bun-windows-x64-modern');
	if (!target) throw new Error('Missing Windows standalone target');
	return target;
}

async function makeRoot(): Promise<string> {
	const root = await testTempDir('aidd-package-release-');
	tmpRoots.push(root);
	return root;
}

/**
 * A release is packaged from a git checkout, and the archive's SOURCE-MANIFEST has to name the
 * commit and the Bun tag it was built from — that manifest is what makes the LGPL source offer
 * fulfillable. Both are now hard requirements rather than fields that quietly read "unknown", so
 * the fixture has to supply them the way a real checkout does.
 */
async function initGitRepo(root: string): Promise<void> {
	const run = async (...args: string[]): Promise<void> => {
		const proc = Bun.spawn(['git', '-C', root, ...args], {
			stderr: 'ignore',
			stdout: 'ignore',
			windowsHide: true,
		});
		if ((await proc.exited) !== 0) throw new Error(`git ${args.join(' ')} failed in ${root}`);
	};
	await run('init', '--quiet');
	await run('config', 'user.email', 'test@example.invalid');
	await run('config', 'user.name', 'Test');
	await run('add', '.');
	await run('commit', '--quiet', '-m', 'fixture');
}

async function seedReleaseSource(root: string): Promise<void> {
	await mkdir(join(root, 'docs', 'guides'), { recursive: true });
	await mkdir(join(root, 'licenses'), { recursive: true });
	await writeFile(join(root, 'licenses', 'LGPL-2.1.txt'), 'GNU LESSER GENERAL PUBLIC LICENSE\n');
	await writeFile(join(root, 'licenses', 'distributed-materials.json'), '{}\n');
	await writeFile(
		join(root, 'package.json'),
		`${JSON.stringify({ packageManager: 'bun@1.3.14', version: '4.5.6' })}\n`
	);
	await writeFile(join(root, 'VERSION'), '4.5.6\n');
	await writeFile(
		join(root, 'docs', 'CHANGELOG.md'),
		'# Changelog\n\n## [4.5.6] - 2026-07-01\n\n### Added\n\n- Release packaging.\n\n## [4.5.5] - 2026-06-30\n'
	);
	for (const file of [
		'README.md',
		'LICENSE',
		'THIRD-PARTY-LICENSES.md',
		'THIRD-PARTY-NOTICES.md',
		'CONTRIBUTING.md',
		'CODE_OF_CONDUCT.md',
		'SECURITY.md',
		'SUPPORT.md',
		'PRIVACY.md',
		'config.json.example',
		'docs/README.md',
		'docs/guides/quickstart.md',
	]) {
		await mkdir(dirname(join(root, file)), { recursive: true });
		await writeFile(join(root, file), file);
	}
	await initGitRepo(root);
}

async function seedStandalone(root: string): Promise<void> {
	const target = windowsTarget();
	const outDir = resolveTargetOutDir(root, target);
	for (const entry of getRequiredDistributionEntries(target)) {
		const fullPath = join(outDir, entry.path);
		if (entry.kind === 'directory') {
			await mkdir(fullPath, { recursive: true });
		} else {
			await mkdir(dirname(fullPath), { recursive: true });
			await writeFile(fullPath, entry.path);
		}
	}
}

afterEach(async () => {
	for (const root of tmpRoots.splice(0)) {
		await rm(root, { force: true, recursive: true });
	}
});

describe('release packager', () => {
	test('parses package-release options', () => {
		const args = parsePackageReleaseArgs([
			'--skip-build',
			'--skip-frontend',
			'--out-dir',
			'out',
			'--target',
			'bun-windows-x64-modern',
		]);
		expect(args.skipBuild).toBe(true);
		expect(args.skipFrontend).toBe(true);
		expect(args.outDir).toBe('out');
		expect(args.targets.map((target) => target.name)).toEqual(['bun-windows-x64-modern']);
	});

	test('stages standalone files, public docs, notes, and checksums', async () => {
		const root = await makeRoot();
		await seedReleaseSource(root);
		await seedStandalone(root);
		await mkdir(join(root, 'release-out', 'stale-stage'), { recursive: true });
		await writeFile(join(root, 'release-out', 'stale-stage', 'sentinel.txt'), 'stale\n');
		await writeFile(join(root, 'release-out', 'aidd-v4.5.5-stale.zip'), 'stale\n');
		await writeFile(join(root, 'docs', 'untracked-private.md'), 'must not ship\n');
		const zipRunner: CommandRunner = async (command, cwd) => {
			const commandText = command.join(' ');
			const destinationMatch = /-DestinationPath '([^']+)'/.exec(commandText);
			const zipName = destinationMatch?.[1] ?? command[2];
			if (!zipName) throw new Error('zip command missing destination');
			await writeFile(join(cwd, zipName), 'zip-bytes');
		};

		const assets = await packageRelease(
			root,
			{
				outDir: 'release-out',
				skipBuild: true,
				skipFrontend: true,
				targets: [windowsTarget()],
			},
			// State the retention choice rather than inheriting it from the ambient environment:
			// this case asserts the maintainer-local behaviour, and reading process.env.CI here
			// meant it passed on a laptop and failed on a runner.
			{ commandRunner: zipRunner, retainRecord: true }
		);

		const releaseDir = join(root, 'release-out');
		const stageDir = join(releaseDir, 'aidd-v4.5.6-bun-windows-x64-modern');
		const notes = await readFile(join(releaseDir, 'release-notes.md'), 'utf8');
		const sums = await readFile(join(releaseDir, 'SHA256SUMS.txt'), 'utf8');

		expect(await readFile(join(stageDir, 'README.md'), 'utf8')).toBe('README.md');
		expect(await readFile(join(stageDir, 'docs', 'guides', 'quickstart.md'), 'utf8')).toBe(
			'docs/guides/quickstart.md'
		);
		expect(await Bun.file(join(stageDir, 'docs', 'untracked-private.md')).exists()).toBe(false);
		expect(await Bun.file(join(releaseDir, 'stale-stage', 'sentinel.txt')).exists()).toBe(
			false
		);
		expect(await Bun.file(join(releaseDir, 'aidd-v4.5.5-stale.zip')).exists()).toBe(false);

		// The binaries embed Bun (LGPL-linked JavaScriptCore/TinyCC), so the notices and the
		// license text have to reach whoever receives the archive.
		expect(await readFile(join(stageDir, 'LICENSE'), 'utf8')).toBe('LICENSE');
		expect(await readFile(join(stageDir, 'THIRD-PARTY-LICENSES.md'), 'utf8')).toBe(
			'THIRD-PARTY-LICENSES.md'
		);
		expect(await readFile(join(stageDir, 'licenses', 'LGPL-2.1.txt'), 'utf8')).toContain(
			'LESSER GENERAL PUBLIC LICENSE'
		);
		expect(await readFile(join(stageDir, 'THIRD-PARTY-NOTICES.md'), 'utf8')).toBe(
			'THIRD-PARTY-NOTICES.md'
		);
		expect(
			await readFile(join(stageDir, 'licenses', 'distributed-materials.json'), 'utf8')
		).toBe('{}\n');
		expect(notes).toContain('# aidd v4.5.6');
		expect(notes).toContain('Release packaging.');
		expect(notes).not.toContain('4.5.5');
		expect(assets.map((asset) => basename(asset.path)).sort()).toEqual([
			'aidd-v4.5.6-bun-windows-x64-modern.zip',
			'release-notes.md',
			// Published as an asset, not just written into the repo: a retention record that only
			// ever existed in a CI workspace retains nothing.
			'source-record-v4.5.6.md',
		]);
		expect(sums).toContain('aidd-v4.5.6-bun-windows-x64-modern.zip');
		expect(sums).toContain('release-notes.md');

		// The offer promises the exact sources for THIS binary, so the archive has to say what they
		// were, and the retained record has to key them to the artifact's hash.
		const manifest = await readFile(join(stageDir, 'licenses', 'SOURCE-MANIFEST.md'), 'utf8');
		expect(manifest).toContain('bun-v');
		expect(manifest).toContain('aidd commit');

		const record = await readFile(join(root, 'licenses', 'releases', 'v4.5.6.md'), 'utf8');
		expect(record).toContain('aidd-v4.5.6-bun-windows-x64-modern.zip');
		expect(record).toContain('SHA-256');
	});

	test('leaves the tree clean when packaging without retention (the CI path)', async () => {
		// The release check refuses to build from a dirty tree, so packaging on a runner must not
		// write into the repo. The record still ships: it is published as a release asset.
		const root = await makeRoot();
		await seedReleaseSource(root);
		await seedStandalone(root);

		const zipRunner: CommandRunner = async (command, cwd) => {
			const commandText = command.join(' ');
			const zipName = /-DestinationPath '([^']+)'/.exec(commandText)?.[1] ?? command[2];
			if (!zipName) throw new Error('zip command missing destination');
			await writeFile(join(cwd, zipName), 'zip-bytes');
		};

		const assets = await packageRelease(
			root,
			{
				outDir: 'release-out',
				skipBuild: true,
				skipFrontend: true,
				targets: [windowsTarget()],
			},
			{ commandRunner: zipRunner, retainRecord: false }
		);

		expect(assets.map((asset) => basename(asset.path))).toContain('source-record-v4.5.6.md');
		expect(await Bun.file(join(root, 'licenses', 'releases', 'v4.5.6.md')).exists()).toBe(
			false
		);
	});

	test('fails fast on version mismatch before building', async () => {
		const root = await makeRoot();
		await seedReleaseSource(root);
		await seedStandalone(root);
		await writeFile(join(root, 'VERSION'), '9.9.9\n');

		let built = false;
		const failIfBuilt = async () => {
			built = true;
			return [];
		};

		await expect(
			packageRelease(
				root,
				{
					outDir: 'release-out',
					skipBuild: false,
					skipFrontend: true,
					targets: [windowsTarget()],
				},
				{ standaloneBuilder: failIfBuilt }
			)
		).rejects.toThrow(/version metadata disagrees/);
		expect(built).toBe(false);
	});

	// The binaries embed Bun, which statically links LGPL libraries (JavaScriptCore,
	// TinyCC). LGPL requires the notice and license text to travel with the executable.
	test('release archive carries the license notices the binaries require', () => {
		const shipped: readonly string[] = PUBLIC_DOC_ASSETS;
		for (const asset of [
			'LICENSE',
			'THIRD-PARTY-LICENSES.md',
			'THIRD-PARTY-NOTICES.md',
			'licenses',
		]) {
			expect(shipped).toContain(asset);
		}
	});
});
