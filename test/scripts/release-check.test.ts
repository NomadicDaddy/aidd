import { afterEach, describe, expect, test } from 'bun:test';

import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import {
	ALL_TARGETS,
	getRequiredDistributionEntries,
	resolveTargetOutDir,
} from '../../scripts/build-standalone.ts';
import { parseReleaseCheckArgs, runReleaseCheck } from '../../scripts/release-check.ts';

import { testTempDir } from '../_helpers/temp.ts';
const tmpRoots: string[] = [];

function windowsTarget() {
	const target = ALL_TARGETS.find((item) => item.name === 'bun-windows-x64-modern');
	if (!target) throw new Error('Missing Windows standalone target');
	return target;
}

async function makeRoot(): Promise<string> {
	const root = await testTempDir('aidd-release-check-');
	tmpRoots.push(root);
	return root;
}

async function seedReleaseFiles(root: string, version = '1.2.3'): Promise<void> {
	await mkdir(join(root, 'docs'), { recursive: true });
	const packageJson = { version };
	await writeFile(join(root, 'package.json'), `${JSON.stringify(packageJson)}\n`);
	await writeFile(join(root, 'VERSION'), `${version}\n`);
	await writeFile(
		join(root, 'docs', 'CHANGELOG.md'),
		`# Changelog\n\n## [${version}] - 2026-07-01\n\n### Added\n\n- Test entry.\n`,
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
		'licenses/distributed-materials.json',
	]) {
		await mkdir(dirname(join(root, file)), { recursive: true });
		await writeFile(join(root, file), file);
	}
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

describe('release check script', () => {
	test('parses release-check options', () => {
		const args = parseReleaseCheckArgs([
			'--allow-dirty',
			'--skip-command-gates',
			'--target',
			'bun-windows-x64-modern',
		]);
		expect(args.allowDirty).toBe(true);
		expect(args.skipCommandGates).toBe(true);
		expect(args.targets.map((target) => target.name)).toEqual(['bun-windows-x64-modern']);
	});

	test('defaults to the Windows target, matching the packager', () => {
		const args = parseReleaseCheckArgs([]);
		expect(args.targets.map((target) => target.name)).toEqual(['bun-windows-x64-modern']);
	});

	test('--all-targets widens to every standalone target', () => {
		const args = parseReleaseCheckArgs(['--all-targets']);
		expect(args.targets.map((target) => target.name)).toEqual(
			ALL_TARGETS.map((target) => target.name),
		);
	});

	// `--all-targets` is the wider request, so it wins over a named target in either order rather
	// than depending on which flag the caller typed last.
	test('--all-targets beats --target regardless of order', () => {
		const names = ALL_TARGETS.map((target) => target.name);
		for (const argv of [
			['--all-targets', '--target', 'bun-windows-x64-modern'],
			['--target', 'bun-windows-x64-modern', '--all-targets'],
		]) {
			expect(parseReleaseCheckArgs(argv).targets.map((target) => target.name)).toEqual(names);
		}
	});

	test('rejects an unknown flag and an unknown target name', () => {
		expect(() => parseReleaseCheckArgs(['--allow-dirtyy'])).toThrow();
		expect(() => parseReleaseCheckArgs(['--target', 'bun-solaris-sparc'])).toThrow(
			'Unknown target',
		);
	});

	test('passes static checks for a complete release layout', async () => {
		const root = await makeRoot();
		await seedReleaseFiles(root);
		await seedStandalone(root);

		const exitCode = await runReleaseCheck(root, {
			allowDirty: true,
			skipCommandGates: true,
			targets: [windowsTarget()],
		});

		expect(exitCode).toBe(0);
	});

	test('fails when version files disagree', async () => {
		const root = await makeRoot();
		await seedReleaseFiles(root);
		await writeFile(join(root, 'VERSION'), '9.9.9\n');
		await seedStandalone(root);

		const exitCode = await runReleaseCheck(root, {
			allowDirty: true,
			skipCommandGates: true,
			targets: [windowsTarget()],
		});

		expect(exitCode).toBe(1);
	});

	test('forwards the selected target to the release archive gate', async () => {
		const root = await makeRoot();
		await seedReleaseFiles(root);
		await seedStandalone(root);
		const commands: string[][] = [];
		const exitCode = await runReleaseCheck(
			root,
			{
				allowDirty: true,
				skipCommandGates: false,
				targets: [windowsTarget()],
			},
			async ({ command }) => {
				commands.push(command);
				return 1;
			},
		);

		expect(exitCode).toBe(1);
		expect(commands[0]).toEqual([
			'bun',
			'run',
			'check:release-notices',
			'--',
			'--target',
			'bun-windows-x64-modern',
		]);
	});
});
