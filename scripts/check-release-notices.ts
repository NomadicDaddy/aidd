/**
 * Verifies the exact release archives users will receive.
 *
 * Enforces: every release archive carries the notices its contents require, checked by opening the
 * archive rather than the source tree. No assertion ID: the catalog states no invariant over
 * distribution obligations.
 */

import { readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { cwd, exit } from 'node:process';
import { parseArgs } from 'node:util';

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
	const { values } = parseArgs({
		args: argv,
		options: {
			'all-targets': { type: 'boolean' },
			dir: { type: 'string' },
			target: { multiple: true, type: 'string' },
		},
		strict: true,
	});
	// parseArgs takes the token after a string flag as its value even when that token is itself a
	// flag, so `--dir --all-targets` would look for archives in a directory named `--all-targets`,
	// find none, and report a missing release rather than the bad argument that caused it.
	const dir = values.dir ?? join('dist', 'release');
	if (dir.length === 0 || dir.startsWith('-')) throw new Error('Missing value for --dir');
	if (values['all-targets'] === true) return { dir, targets: [...ALL_TARGETS] };

	const targets = (values.target ?? []).map((name) => {
		if (name.length === 0 || name.startsWith('-'))
			throw new Error('Missing value for --target');
		const target = ALL_TARGETS.find((candidate) => candidate.name === name);
		if (target === undefined) {
			throw new Error(
				`Unknown target: ${name}. Known: ${ALL_TARGETS.map((item) => item.name).join(', ')}`,
			);
		}
		return target;
	});
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

export async function runReleaseNotices(
	argv = Bun.argv.slice(2),
	rootDir = cwd(),
): Promise<number> {
	try {
		const issues = await checkReleaseNotices(rootDir, parseReleaseNoticeArgs(argv));
		if (issues.length > 0) {
			console.error('[FAIL] release-notices: release archive validation failed:');
			for (const issue of issues) console.error(`- ${issue}`);
			return 1;
		}
		console.log('[OK] release-notices: release archives match the current source and catalog');
		return 0;
	} catch (err) {
		console.error(`[FAIL] release-notices: ${errorMessage(err)}`);
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

if (import.meta.main) exit(await runReleaseNotices());
