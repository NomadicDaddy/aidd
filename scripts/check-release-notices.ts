/** Verifies the exact release archives users will receive. */

import { readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { cwd, exit } from 'node:process';

import { ALL_TARGETS, type CompileTarget } from './build-standalone.ts';
import { openReleaseArchive } from './lib/release-notices/archive.ts';
import {
	archiveName,
	releaseArchiveRequiredPaths,
	stageName,
	validateReleaseArchive,
	validateReleaseDirectory,
} from './lib/release-notices/validation.ts';
import { assertVersionParity, errorMessage, readVersionInfo } from './lib/release/common.ts';
import { collectSourceRevisions } from './lib/release/source-manifest.ts';
import { CORE_CATALOG_DIRS } from './lib/standalone/constants.ts';
import { listTrackedFiles } from './lib/third-party-licenses/distributed-paths.ts';
import { loadDistributedMaterialsRegistry } from './lib/third-party-licenses/registry.ts';

interface ReleaseNoticeArgs {
	dir: string;
	targets: CompileTarget[];
}

export function parseReleaseNoticeArgs(argv: string[]): ReleaseNoticeArgs {
	const targets: CompileTarget[] = [];
	let dir = join('dist', 'release');
	for (let index = 0; index < argv.length; index++) {
		const token = argv[index];
		if (token === '--all-targets') {
			targets.splice(0, targets.length, ...ALL_TARGETS);
		} else if (token === '--dir') {
			dir = argv[++index] ?? '';
			if (dir.length === 0) throw new Error('Missing value for --dir');
		} else if (token === '--target') {
			const name = argv[++index];
			if (name === undefined) throw new Error('Missing value for --target');
			const target = ALL_TARGETS.find((candidate) => candidate.name === name);
			if (target === undefined) {
				throw new Error(
					`Unknown target: ${name}. Known: ${ALL_TARGETS.map((item) => item.name).join(', ')}`,
				);
			}
			targets.push(target);
		} else {
			throw new Error(`Unknown argument: ${token}`);
		}
	}
	return {
		dir,
		targets: targets.length > 0 ? uniqueTargets(targets) : [windowsTarget()],
	};
}

export async function checkReleaseNotices(
	rootDir: string,
	args: ReleaseNoticeArgs,
): Promise<string[]> {
	const releaseDir = resolve(rootDir, args.dir);
	const info = await readVersionInfo(rootDir);
	const issues = assertVersionParity(info);
	let entries;
	try {
		entries = await readdir(releaseDir, { withFileTypes: true });
	} catch {
		return [`No built release found under ${releaseDir}`];
	}
	issues.push(
		...validateReleaseDirectory(
			entries.map((entry) => ({
				isDirectory: entry.isDirectory(),
				isFile: entry.isFile(),
				name: entry.name,
			})),
			info.packageVersion,
			args.targets,
		),
	);
	if (issues.length > 0) return issues;

	const revisions = await collectSourceRevisions(rootDir, info.packageVersion);
	const catalogPaths = await listTrackedFiles(rootDir, CORE_CATALOG_DIRS);
	const registry = await loadDistributedMaterialsRegistry(rootDir);
	const requiredPaths = releaseArchiveRequiredPaths(registry);
	for (const target of args.targets) {
		const name = archiveName(info.packageVersion, target);
		try {
			const archive = await openReleaseArchive(join(releaseDir, name));
			const archiveIssues = await validateReleaseArchive({
				archive,
				catalogPaths,
				requiredPaths,
				revisions,
				stage: stageName(info.packageVersion, target),
			});
			issues.push(...archiveIssues.map((issue) => `${name}: ${issue}`));
		} catch (err) {
			issues.push(`${name}: ${errorMessage(err)}`);
		}
	}
	return issues;
}

export async function main(argv = Bun.argv.slice(2), rootDir = cwd()): Promise<number> {
	try {
		const issues = await checkReleaseNotices(rootDir, parseReleaseNoticeArgs(argv));
		if (issues.length > 0) {
			console.error('[release-notices] release archive validation failed:');
			for (const issue of issues) console.error(`- ${issue}`);
			return 1;
		}
		console.log('[release-notices] release archives match the current source and catalog');
		return 0;
	} catch (err) {
		console.error(`Error: ${errorMessage(err)}`);
		return 2;
	}
}

function windowsTarget(): CompileTarget {
	const target = ALL_TARGETS.find((candidate) => candidate.name === 'bun-windows-x64-modern');
	if (target === undefined) throw new Error('Missing Windows standalone target');
	return target;
}

function uniqueTargets(targets: CompileTarget[]): CompileTarget[] {
	return [...new Map(targets.map((target) => [target.name, target])).values()];
}

if (import.meta.main) exit(await main());
