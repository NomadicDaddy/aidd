import { existsSync } from 'node:fs';
import { cp, mkdir, stat } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';

import { copyTrackedFiles } from '../third-party-licenses/distributed-paths.ts';
import {
	CORE_CATALOG_DIRS,
	REQUIRED_FILE_ASSETS,
	type CompileTarget,
	type RequiredDistributionEntry,
} from './constants.ts';

export async function copyAssets(rootDir: string, outDir: string): Promise<void> {
	await copyTrackedFiles(rootDir, outDir, [...CORE_CATALOG_DIRS, ...REQUIRED_FILE_ASSETS]);
	const relative = 'frontend/dist';
	const source = join(rootDir, relative);
	const destination = join(outDir, relative);
	if (!existsSync(source)) {
		console.warn(`[build-standalone] WARN: missing asset ${relative}, skipping`);
		return;
	}
	await mkdir(dirname(destination), { recursive: true });
	await cp(source, destination, { recursive: true });
}

export function getBinaryNames(target: CompileTarget): { cli: string; web: string } {
	return {
		cli: `aidd${target.suffix}`,
		web: `aidd-web${target.suffix}`,
	};
}

export function getRequiredDistributionEntries(target: CompileTarget): RequiredDistributionEntry[] {
	const binaries = getBinaryNames(target);
	return [
		{ kind: 'file', path: binaries.cli },
		{ kind: 'file', path: binaries.web },
		{ kind: 'file', path: 'README.txt' },
		{ kind: 'file', path: 'VERSION' },
		{ kind: 'file', path: 'config.json.example' },
		{ kind: 'file', path: 'LICENSE' },
		{ kind: 'file', path: 'THIRD-PARTY-LICENSES.md' },
		{ kind: 'file', path: 'frontend/dist/index.html' },
		...CORE_CATALOG_DIRS.map((path) => ({ kind: 'directory' as const, path })),
	];
}

export async function validateDistributionLayout(
	outDir: string,
	target: CompileTarget
): Promise<string[]> {
	const issues: string[] = [];
	for (const entry of getRequiredDistributionEntries(target)) {
		const fullPath = join(outDir, entry.path);
		try {
			const info = await stat(fullPath);
			const valid = entry.kind === 'directory' ? info.isDirectory() : info.isFile();
			if (!valid) {
				issues.push(`${entry.path} is not a ${entry.kind}`);
			}
		} catch (err) {
			if (isNotFoundError(err)) {
				issues.push(`missing ${entry.kind}: ${entry.path}`);
				continue;
			}
			throw err;
		}
	}
	return issues;
}

export async function assertDistributionLayout(
	outDir: string,
	target: CompileTarget
): Promise<void> {
	const issues = await validateDistributionLayout(outDir, target);
	if (issues.length > 0) {
		throw new Error(
			`[build-standalone] invalid standalone distribution for ${target.name}:\n${issues
				.map((issue) => `- ${issue}`)
				.join('\n')}`
		);
	}
}

export function generateReadmeText(target: CompileTarget): string {
	const binarySuffix = target.suffix;
	const lines = [
		`aidd standalone build (${target.name})`,
		'',
		'Usage:',
		`  ./aidd-web${binarySuffix} --port 7766       # start the web control panel`,
		`  ./aidd-web${binarySuffix} --help            # web binary help/version`,
		`  ./aidd${binarySuffix} --help                # run the CLI`,
		'',
		'From a source checkout, verify this distribution with:',
		`  bun run check:standalone -- --target ${target.name} --probe-binaries`,
		'',
		'This directory must stay intact: the binaries read sibling asset trees',
		'(audits/, skills/, scaffolding/, prompts/, recipes/,',
		'frontend/dist/) and write runtime state to data/.',
		'',
	];
	return lines.join('\n');
}

export async function writeReadme(outDir: string, target: CompileTarget): Promise<void> {
	await Bun.write(join(outDir, 'README.txt'), generateReadmeText(target));
}

export function resolveTargetOutDir(rootDir: string, target: CompileTarget): string {
	const distRoot = resolve(rootDir, 'dist');
	const outDir = resolve(distRoot, target.name);
	assertInsideDirectory(distRoot, outDir);
	return outDir;
}

function assertInsideDirectory(parent: string, child: string): void {
	const childRelative = relative(parent, child);
	if (childRelative === '' || childRelative.startsWith('..') || isAbsolute(childRelative)) {
		throw new Error(`Refusing to write outside ${parent}: ${child}`);
	}
}

function isNotFoundError(error: unknown): boolean {
	return (
		typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
	);
}
