import { cp, mkdir, rm } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { cwd, exit, platform } from 'node:process';

import {
	ALL_TARGETS,
	buildStandalone,
	type BuildTargetResult,
	type CliArgs,
	type CommandRunner,
	type CompileTarget,
	resolveTargetOutDir,
	validateDistributionLayout,
} from './build-standalone.ts';
import {
	assertVersionParity,
	errorMessage,
	formatReleaseNotes,
	PUBLIC_DOC_ASSETS,
	readVersionInfo,
	sha256File,
} from './lib/release/common.ts';
import {
	collectSourceRevisions,
	renderReleaseRecord,
	renderSourceManifest,
} from './lib/release/source-manifest.ts';
import { copyTrackedFiles } from './lib/third-party-licenses/distributed-paths.ts';

interface PackageReleaseArgs {
	outDir: string;
	skipBuild: boolean;
	skipFrontend: boolean;
	targets: CompileTarget[];
}

interface PackageReleaseOptions {
	commandRunner?: CommandRunner;
	/**
	 * Also write the source record into licenses/releases/, for a maintainer to commit. Defaults
	 * off on CI, where the workspace is discarded (so the copy retains nothing) and an untracked
	 * file makes the release check refuse to build from a dirty tree.
	 */
	retainRecord?: boolean;
	standaloneBuilder?: (
		rootDir: string,
		args: CliArgs,
		options: { commandRunner?: CommandRunner },
	) => Promise<BuildTargetResult[]>;
}

interface ReleaseAsset {
	path: string;
	sha256: string;
}

export function parsePackageReleaseArgs(argv: string[]): PackageReleaseArgs {
	const targets: CompileTarget[] = [];
	let outDir = 'dist/release';
	let skipBuild = false;
	let skipFrontend = false;
	for (let i = 0; i < argv.length; i++) {
		const token = argv[i];
		if (token === '--all-targets') {
			targets.splice(0, targets.length, ...ALL_TARGETS);
		} else if (token === '--out-dir') {
			outDir = argv[++i] ?? '';
			if (outDir.length === 0) throw new Error('Missing value for --out-dir');
		} else if (token === '--skip-build') {
			skipBuild = true;
		} else if (token === '--skip-frontend') {
			skipFrontend = true;
		} else if (token === '--target') {
			const targetName = argv[++i];
			if (!targetName) throw new Error('Missing value for --target');
			const target = ALL_TARGETS.find((item) => item.name === targetName);
			if (!target) {
				throw new Error(
					`Unknown target: ${targetName}. Known: ${ALL_TARGETS.map((item) => item.name).join(', ')}`,
				);
			}
			targets.push(target);
		} else {
			throw new Error(`Unknown argument: ${token}`);
		}
	}
	return {
		outDir,
		skipBuild,
		skipFrontend,
		targets: targets.length > 0 ? targets : [windowsTarget()],
	};
}

export async function packageRelease(
	rootDir: string,
	args: PackageReleaseArgs,
	options: PackageReleaseOptions = {},
): Promise<ReleaseAsset[]> {
	const builder = options.standaloneBuilder ?? buildStandalone;
	const commandRunner = options.commandRunner ?? runCommand;
	const releaseDir = resolve(rootDir, args.outDir);
	const info = await readVersionInfo(rootDir);

	// Fail fast on version mismatch before spending build time.
	const parityIssues = assertVersionParity(info);
	if (parityIssues.length > 0) {
		throw new Error(
			`Cannot package release; version metadata disagrees:\n${parityIssues
				.map((issue) => `- ${issue}`)
				.join('\n')}`,
		);
	}

	if (!args.skipBuild) {
		const results = await builder(
			rootDir,
			{ skipFrontend: args.skipFrontend, targets: args.targets },
			{ commandRunner },
		);
		const failed = results.filter((result) => result.status === 'failed');
		if (failed.length > 0) {
			throw new Error(
				`Standalone build failed:\n${failed
					.map((result) => `- ${result.target.name}: ${result.errorMessage}`)
					.join('\n')}`,
			);
		}
	}

	await rm(releaseDir, { force: true, recursive: true });
	await mkdir(releaseDir, { recursive: true });
	const revisions = await collectSourceRevisions(rootDir, info.packageVersion);

	const assets: ReleaseAsset[] = [];
	for (const target of args.targets) {
		const sourceDir = resolveTargetOutDir(rootDir, target);
		const issues = await validateDistributionLayout(sourceDir, target);
		if (issues.length > 0) {
			throw new Error(
				`Cannot package ${target.name}; standalone layout is incomplete:\n${issues
					.map((issue) => `- ${issue}`)
					.join('\n')}`,
			);
		}
		const stageName = `aidd-v${info.packageVersion}-${target.name}`;
		const stageDir = join(releaseDir, stageName);
		await cp(sourceDir, stageDir, { recursive: true });
		await copyPublicDocs(rootDir, stageDir);
		// The offer promises the exact Bun/WebKit/TinyCC sources for THIS binary. Ship the record
		// of what they were, inside the archive, or the promise points at nothing years from now.
		await Bun.write(
			join(stageDir, 'licenses', 'SOURCE-MANIFEST.md'),
			renderSourceManifest(revisions),
		);
		const zipPath = join(releaseDir, `${stageName}.zip`);
		await createZip(releaseDir, stageName, basename(zipPath), commandRunner);
		assets.push({ path: zipPath, sha256: await sha256File(zipPath) });
	}

	const notesPath = join(releaseDir, 'release-notes.md');
	await Bun.write(notesPath, formatReleaseNotes(info));
	assets.push({ path: notesPath, sha256: await sha256File(notesPath) });

	// The record the offer is answered from when a recipient identifies an artifact by hash. It is
	// always published as a release asset, which is where the durable copy lives.
	//
	// The copy under licenses/releases/ is for a maintainer packaging locally, who can commit it.
	// On CI that copy retains nothing — the workspace is discarded — and writing it there only
	// dirties the tree, which the release check then (correctly) refuses to build from.
	const record = renderReleaseRecord(
		revisions,
		assets
			.filter((asset) => asset.path.endsWith('.zip'))
			.map((asset) => ({ name: basename(asset.path), sha256: asset.sha256 })),
	);
	const retainRecord = options.retainRecord ?? !process.env.CI;
	if (retainRecord) {
		await Bun.write(
			join(rootDir, 'licenses', 'releases', `v${info.packageVersion}.md`),
			record,
		);
	}

	const recordPath = join(releaseDir, `source-record-v${info.packageVersion}.md`);
	await Bun.write(recordPath, record);
	assets.push({ path: recordPath, sha256: await sha256File(recordPath) });

	await writeChecksums(releaseDir, assets);
	console.log(`[package-release] wrote ${assets.length + 1} release files to ${releaseDir}`);
	return assets;
}

export async function main(argv = Bun.argv.slice(2), rootDir = cwd()): Promise<number> {
	try {
		await packageRelease(rootDir, parsePackageReleaseArgs(argv));
		return 0;
	} catch (err) {
		console.error(`Error: ${errorMessage(err)}`);
		return 1;
	}
}

async function copyPublicDocs(rootDir: string, stageDir: string): Promise<void> {
	await copyTrackedFiles(rootDir, stageDir, PUBLIC_DOC_ASSETS);
}

async function createZip(
	releaseDir: string,
	stageName: string,
	zipName: string,
	commandRunner: CommandRunner,
): Promise<void> {
	const command =
		platform === 'win32'
			? [
					'pwsh',
					'-NoProfile',
					'-Command',
					`Compress-Archive -Path '${stageName}' -DestinationPath '${zipName}' -Force`,
				]
			: ['zip', '-qr', zipName, stageName];
	await commandRunner(command, releaseDir);
}

async function runCommand(command: string[], cwd: string): Promise<void> {
	const [program, ...rest] = command;
	if (!program) throw new Error('runCommand requires a program');
	const proc = Bun.spawn([program, ...rest], {
		cwd,
		stderr: 'inherit',
		stdout: 'inherit',
		windowsHide: true,
	});
	const code = await proc.exited;
	if (code !== 0) throw new Error(`Command failed (exit ${code}): ${command.join(' ')}`);
}

async function writeChecksums(releaseDir: string, assets: ReleaseAsset[]): Promise<void> {
	const lines = assets
		.map((asset) => `${asset.sha256}  ${basename(asset.path)}`)
		.sort((a, b) => a.localeCompare(b));
	await Bun.write(join(releaseDir, 'SHA256SUMS.txt'), `${lines.join('\n')}\n`);
}

function windowsTarget(): CompileTarget {
	const target = ALL_TARGETS.find((item) => item.name === 'bun-windows-x64-modern');
	if (!target) throw new Error('Missing Windows standalone target');
	return target;
}

if (import.meta.main) {
	exit(await main());
}
