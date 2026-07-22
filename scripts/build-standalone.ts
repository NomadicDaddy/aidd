import { mkdir, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
	compile,
	parseArgs,
	runCommand,
	webCompileFlagsForTarget,
} from './lib/standalone/compile.ts';
import {
	errorMessage,
	type BuildTargetOptions,
	type BuildTargetResult,
	type CliArgs,
	type CompileTarget,
} from './lib/standalone/constants.ts';
import {
	assertDistributionLayout,
	copyAssets,
	resolveTargetOutDir,
	writeReadme,
} from './lib/standalone/distribution.ts';

export {
	compile,
	createCompileCommand,
	parseArgs,
	runCommand,
	webCompileFlagsForTarget,
} from './lib/standalone/compile.ts';
export type {
	BuildTargetOptions,
	BuildTargetResult,
	CliArgs,
	CommandRunner,
	CompileTarget,
	CompileTargetName,
} from './lib/standalone/constants.ts';
export {
	ALL_TARGETS,
	CORE_CATALOG_DIRS,
	REQUIRED_FILE_ASSETS,
} from './lib/standalone/constants.ts';
export {
	assertDistributionLayout,
	copyAssets,
	generateReadmeText,
	getBinaryNames,
	getRequiredDistributionEntries,
	resolveTargetOutDir,
	validateDistributionLayout,
	writeReadme,
} from './lib/standalone/distribution.ts';

export async function buildTarget(
	rootDir: string,
	target: CompileTarget,
	options: BuildTargetOptions = {}
): Promise<void> {
	const commandRunner = options.commandRunner ?? runCommand;
	const outDir = resolveTargetOutDir(rootDir, target);
	console.log(`[build-standalone] target=${target.name}: cleaning ${outDir}`);
	await rm(outDir, { force: true, recursive: true });
	await mkdir(outDir, { recursive: true });

	const cliEntrypoint = join(rootDir, 'cli', 'src', 'index.ts');
	const cliOut = join(outDir, `aidd${target.suffix}`);
	console.log(`[build-standalone] compiling CLI -> ${cliOut}`);
	await compile(rootDir, target, cliEntrypoint, cliOut, [], commandRunner);

	const webEntrypoint = join(rootDir, 'backend', 'src', 'app.ts');
	const webOut = join(outDir, `aidd-web${target.suffix}`);
	const webFlags = webCompileFlagsForTarget(target);
	// The DB worker must be an explicit extra entrypoint so it is embedded in
	// the executable; backend/src/db/client.ts loads it by bundle-relative path
	// in compiled mode. Without it the web binary hangs at startup waiting for
	// a worker that can never load.
	const webExtraEntrypoints = [join(rootDir, 'backend', 'src', 'db', 'worker', 'dbWorker.ts')];
	console.log(`[build-standalone] compiling Web -> ${webOut}`);
	await compile(
		rootDir,
		target,
		webEntrypoint,
		webOut,
		webFlags,
		commandRunner,
		webExtraEntrypoints
	);

	console.log(`[build-standalone] copying sibling assets`);
	await copyAssets(rootDir, outDir);
	await writeReadme(outDir, target);
	await assertDistributionLayout(outDir, target);
	console.log(`[build-standalone] target=${target.name}: done -> ${outDir}`);
}

export async function buildStandalone(
	rootDir: string,
	args: CliArgs,
	options: BuildTargetOptions = {}
): Promise<BuildTargetResult[]> {
	const commandRunner = options.commandRunner ?? runCommand;

	if (!args.skipFrontend) {
		console.log('[build-standalone] building frontend');
		await commandRunner(['bun', 'run', 'build:frontend'], rootDir);
	} else {
		console.log('[build-standalone] --skip-frontend: assuming frontend/dist is current');
	}

	const results: BuildTargetResult[] = [];
	for (const target of args.targets) {
		const outDir = resolveTargetOutDir(rootDir, target);
		try {
			await buildTarget(rootDir, target, { commandRunner });
			results.push({ errorMessage: null, outDir, status: 'success', target });
		} catch (err) {
			await rm(outDir, { force: true, recursive: true });
			results.push({
				errorMessage: errorMessage(err),
				outDir,
				status: 'failed',
				target,
			});
		}
	}

	return results;
}

export function formatBuildSummary(results: BuildTargetResult[]): string {
	const lines = ['[build-standalone] target summary'];
	for (const result of results) {
		if (result.status === 'success') {
			lines.push(`[PASS] ${result.target.name} -> ${result.outDir}`);
		} else {
			lines.push(`[FAIL] ${result.target.name}: ${result.errorMessage}`);
		}
	}
	return lines.join('\n');
}

export async function main(
	argv: string[] = process.argv.slice(2),
	rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
): Promise<number> {
	let args: CliArgs;
	try {
		args = parseArgs(argv);
	} catch (err) {
		console.error(`Error: ${errorMessage(err)}`);
		return 2;
	}

	try {
		const results = await buildStandalone(rootDir, args);
		console.log(formatBuildSummary(results));
		return results.some((result) => result.status === 'failed') ? 1 : 0;
	} catch (err) {
		console.error(`Error: ${errorMessage(err)}`);
		return 1;
	}
}

if (import.meta.main) {
	process.exit(await main());
}
