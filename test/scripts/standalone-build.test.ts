import { afterEach, describe, expect, test } from 'bun:test';

import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import {
	ALL_TARGETS,
	CORE_CATALOG_DIRS,
	REQUIRED_FILE_ASSETS,
	type CommandRunner,
	buildStandalone,
	createCompileCommand,
	generateReadmeText,
	getRequiredDistributionEntries,
	parseArgs,
	resolveTargetOutDir,
	validateDistributionLayout,
	webCompileFlagsForTarget,
} from '../../scripts/build-standalone.ts';

import { testTempDir } from '../_helpers/temp.ts';
const tmpRoots: string[] = [];

function windowsTarget() {
	const target = ALL_TARGETS.find((item) => item.name === 'bun-windows-x64-modern');
	if (!target) throw new Error('Missing Windows standalone target');
	return target;
}

function linuxTarget() {
	const target = ALL_TARGETS.find((item) => item.name === 'bun-linux-x64-modern');
	if (!target) throw new Error('Missing Linux standalone target');
	return target;
}

async function makeRoot(): Promise<string> {
	const root = await testTempDir('aidd-standalone-build-');
	tmpRoots.push(root);
	return root;
}

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

async function seedRequiredSourceAssets(root: string): Promise<void> {
	for (const dir of CORE_CATALOG_DIRS) {
		await mkdir(join(root, dir), { recursive: true });
		await writeFile(join(root, dir, '.keep'), '');
	}
	await mkdir(join(root, 'frontend', 'dist'), { recursive: true });
	await writeFile(join(root, 'frontend', 'dist', 'index.html'), '<html></html>');
	for (const file of REQUIRED_FILE_ASSETS) {
		await writeFile(join(root, file), file);
	}
}

async function seedDistributionLayout(root: string): Promise<string> {
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
	return outDir;
}

async function pathExists(path: string): Promise<boolean> {
	try {
		await stat(path);
		return true;
	} catch (error) {
		if (
			typeof error === 'object' &&
			error !== null &&
			'code' in error &&
			error.code === 'ENOENT'
		) {
			return false;
		}
		throw error;
	}
}

afterEach(async () => {
	for (const root of tmpRoots.splice(0)) {
		await rm(root, { force: true, recursive: true });
	}
});

describe('standalone build script helpers', () => {
	test('parseArgs defaults to every supported target', () => {
		const args = parseArgs([]);
		expect(args.skipFrontend).toBe(false);
		expect(args.targets.map((target) => target.name)).toEqual(
			ALL_TARGETS.map((target) => target.name)
		);
	});

	test('parseArgs selects one target and skip-frontend', () => {
		const args = parseArgs(['--target', 'bun-windows-x64-modern', '--skip-frontend']);
		expect(args.skipFrontend).toBe(true);
		expect(args.targets.map((target) => target.name)).toEqual(['bun-windows-x64-modern']);
	});

	test('parseArgs rejects unknown targets', () => {
		expect(() => parseArgs(['--target', 'bun-plan9-x64'])).toThrow('Unknown target');
	});

	test('compile command places Bun compile flags before entrypoint', () => {
		const command = createCompileCommand(
			windowsTarget(),
			'cli/src/index.ts',
			'dist/aidd.exe',
			[]
		);
		expect(command).toEqual([
			'bun',
			'build',
			'--compile',
			'--target=bun-windows-x64-modern',
			'--outfile',
			'dist/aidd.exe',
			'cli/src/index.ts',
		]);
	});

	test('compile command appends extra entrypoints after the main entrypoint', () => {
		const command = createCompileCommand(
			windowsTarget(),
			'backend/src/app.ts',
			'dist/aidd-web.exe',
			['--windows-hide-console'],
			['backend/src/db/worker/dbWorker.ts']
		);
		expect(command.slice(-2)).toEqual([
			'backend/src/app.ts',
			'backend/src/db/worker/dbWorker.ts',
		]);
	});

	test('windows web builds hide the console while CLI builds do not', () => {
		expect(webCompileFlagsForTarget(windowsTarget())).toEqual(['--windows-hide-console']);
		expect(webCompileFlagsForTarget(linuxTarget())).toEqual([]);
		expect(createCompileCommand(windowsTarget(), 'cli.ts', 'aidd.exe', [])).not.toContain(
			'--windows-hide-console'
		);
	});

	test('generated README names binary probes and distribution checker', () => {
		const text = generateReadmeText(windowsTarget());
		expect(text).toContain('./aidd-web.exe --help');
		expect(text).toContain('./aidd.exe --help');
		expect(text).toContain(
			'bun run check:standalone -- --target bun-windows-x64-modern --probe-binaries'
		);
	});

	test('distribution validation reports missing required assets', async () => {
		const root = await makeRoot();
		const outDir = resolveTargetOutDir(root, windowsTarget());
		await mkdir(outDir, { recursive: true });

		const issues = await validateDistributionLayout(outDir, windowsTarget());
		expect(issues).toContain('missing file: aidd.exe');
		expect(issues).toContain('missing file: aidd-web.exe');
		expect(issues).toContain('missing file: frontend/dist/index.html');
		expect(issues).toContain('missing directory: audits');
	});

	test('distribution validation accepts a complete target layout', async () => {
		const root = await makeRoot();
		const outDir = await seedDistributionLayout(root);

		await expect(validateDistributionLayout(outDir, windowsTarget())).resolves.toEqual([]);
	});

	test('buildStandalone aggregates target failures and keeps successful output', async () => {
		const root = await makeRoot();
		await seedRequiredSourceAssets(root);
		await initGitRepo(root);
		const commandRunner: CommandRunner = async (command) => {
			if (command.some((part) => part.includes('bun-linux-x64-modern'))) {
				throw new Error('simulated Linux compile failure');
			}
			const outfileIndex = command.indexOf('--outfile');
			const outfile = command[outfileIndex + 1];
			if (!outfile) throw new Error('missing outfile');
			await mkdir(dirname(outfile), { recursive: true });
			await writeFile(outfile, 'binary');
		};

		const results = await buildStandalone(
			root,
			{ skipFrontend: true, targets: [windowsTarget(), linuxTarget()] },
			{ commandRunner }
		);

		expect(results.map((result) => [result.target.name, result.status])).toEqual([
			['bun-windows-x64-modern', 'success'],
			['bun-linux-x64-modern', 'failed'],
		]);
		expect(await pathExists(resolveTargetOutDir(root, windowsTarget()))).toBe(true);
		expect(await pathExists(resolveTargetOutDir(root, linuxTarget()))).toBe(false);
	});
});
