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

export interface ReleaseNoticeScan {
	/** Archives opened and validated. */
	archives: number;
	/** Tracked catalog files compared against each archive. Rule 5's count for this gate. */
	filesCompared: number;
	issues: string[];
}

export async function checkReleaseNotices(
	rootDir: string,
	args: ReleaseNoticeArgs,
): Promise<ReleaseNoticeScan> {
	const releaseDir = resolve(rootDir, args.dir);
	const info = await readVersionInfo(rootDir);
	const issues = assertVersionParity(info);
	let entries;
	try {
		entries = await readdir(releaseDir, { withFileTypes: true });
	} catch {
		return {
			archives: 0,
			filesCompared: 0,
			issues: [`No built release found under ${releaseDir}`],
		};
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
	if (issues.length > 0) return { archives: 0, filesCompared: 0, issues };

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
	return { archives: args.targets.length, filesCompared: catalogPaths.length, issues };
}

export async function runReleaseNotices(
	argv = Bun.argv.slice(2),
	rootDir = cwd(),
): Promise<number> {
	try {
		const { archives, filesCompared, issues } = await checkReleaseNotices(
			rootDir,
			parseReleaseNoticeArgs(argv),
		);
		if (issues.length > 0) {
			console.error('[FAIL] release-notices: release archive validation failed:');
			for (const issue of issues) console.error(`- ${issue}`);
			return 1;
		}

		// Rule 5. The catalog side of this comparison is discovered by listing tracked files under
		// `CORE_CATALOG_DIRS`, so a renamed directory produces an empty catalog, no mismatch to
		// report, and a pass that compared each archive against nothing at all.
		if (archives === 0 || filesCompared === 0) {
			console.error('[FAIL] release-notices: nothing was compared.');
			console.error(
				`- ${archives} archive(s) validated against ${filesCompared} catalog file(s); ` +
					'an archive matches the catalog only if there was a catalog to match.',
			);
			return 1;
		}

		console.log(
			`[OK] release-notices: ${archives} release archive(s) match the current source and ` +
				`catalog (${filesCompared} tracked file(s) compared)`,
		);
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
