import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';

import {
	GENERATED_OUTPUT_PREFIX,
	isGeneratedOutputStep,
	SMOKE_CACHE_RELATIVE_PATH,
	STEP_DEPENDENCIES,
	TEST_RUNTIME_INPUTS,
	TEST_STEP_NAME,
} from './dependencies.ts';
import { collectPrettierDependencies } from './prettier.ts';

/**
 * File collection and hashing for the smoke cache. Split from dependencies.ts so that file
 * DECLARES what each step depends on and this file RESOLVES it — the same split spernakit has.
 */
const IGNORED_SEGMENTS = new Set([
	'.git',
	'data',
	GENERATED_OUTPUT_PREFIX,
	'logs',
	'node_modules',
	'screenshots',
]);

interface CachedFileRead {
	contents: Uint8Array;
	ctimeMs: number;
	mtimeMs: number;
	size: number;
}

export interface SmokeCacheEvaluationContext {
	fileReads: Map<string, CachedFileRead>;
	globMatches: Map<string, Promise<string[]>>;
	repositoryFiles: null | Promise<string[]>;
}

export function createSmokeCacheEvaluationContext(): SmokeCacheEvaluationContext {
	return {
		fileReads: new Map(),
		globMatches: new Map(),
		repositoryFiles: null,
	};
}

export function clearSmokeCacheEvaluationContext(context: SmokeCacheEvaluationContext): void {
	context.fileReads.clear();
	context.globMatches.clear();
	context.repositoryFiles = null;
}

/**
 * `frontend/dist` is normally excluded: it is generated, so hashing it into a producer's key would
 * make that step depend on its own output. Steps that CONSUME the build are the exception — a gate
 * that inspects dist and does not hash it will sit cached over a stale, partial, or hand-altered
 * artifact, which is precisely the state such a gate exists to catch.
 */
function isIgnored(relativePath: string, allowGeneratedOutput = false): boolean {
	const normalized = relativePath.replaceAll('\\', '/');
	if (normalized === SMOKE_CACHE_RELATIVE_PATH) return true;
	for (const segment of IGNORED_SEGMENTS) {
		if (allowGeneratedOutput && segment === GENERATED_OUTPUT_PREFIX) continue;
		if (normalized === segment || normalized.startsWith(`${segment}/`)) return true;
	}
	return false;
}

async function pathExists(path: string): Promise<boolean> {
	try {
		await stat(path);
		return true;
	} catch (err) {
		if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
			return false;
		}
		throw err;
	}
}

async function scanGlob(
	projectRoot: string,
	pattern: string,
	allowGeneratedOutput: boolean,
	context?: SmokeCacheEvaluationContext,
): Promise<string[]> {
	const key = `${allowGeneratedOutput ? 'generated' : 'source'}\0${pattern}`;
	const scan = async (): Promise<string[]> => {
		const matches: string[] = [];
		const glob = new Bun.Glob(pattern);
		// `dot` is required, not cosmetic: without it Bun.Glob skips dot-directories, so declared
		// patterns like `.githooks/**/*` and `.github/**/*` silently match NOTHING and their steps
		// cache against an empty input set — edit a hook or a workflow and the gate replays a pass
		// over it. IGNORED_SEGMENTS already carries `.git`, which is only meaningful with this on.
		for await (const relativePath of glob.scan({
			cwd: projectRoot,
			dot: true,
			onlyFiles: true,
		})) {
			const normalized = relativePath.split(sep).join('/');
			if (!isIgnored(normalized, allowGeneratedOutput)) matches.push(normalized);
		}
		return matches;
	};

	if (context === undefined) return await scan();
	const existing = context.globMatches.get(key);
	if (existing !== undefined) return await existing;
	const pending = scan();
	context.globMatches.set(key, pending);
	return await pending;
}

async function collectRepositoryFiles(
	projectRoot: string,
	context?: SmokeCacheEvaluationContext,
): Promise<string[]> {
	const collect = async (): Promise<string[]> => {
		// A project with no repository has no inventory, so its declared patterns are the whole
		// key. Inside a repository the inventory IS the key, so a git that cannot answer must
		// fail loudly: silently falling back to the narrower declared list would key the step on
		// less than its tests read, and let an unexamined change replay an old pass.
		if (!(await pathExists(resolve(projectRoot, '.git')))) return [];
		let output = '';
		let exitCode: number;
		try {
			// Bun.spawn throws ENOENT for a missing binary instead of returning a non-zero exit.
			const child = Bun.spawn(
				[
					'git',
					'-C',
					projectRoot,
					'ls-files',
					'--cached',
					'--others',
					'--exclude-standard',
					'-z',
				],
				{ stderr: 'ignore', stdout: 'pipe', windowsHide: true },
			);
			output = await new Response(child.stdout).text();
			exitCode = await child.exited;
		} catch {
			exitCode = -1;
		}
		if (exitCode !== 0) {
			throw new Error(
				`Cannot read the git worktree inventory for ${projectRoot}, so the ` +
					`${TEST_STEP_NAME} step cannot be keyed on the sources its tests read as ` +
					'text. Run this from a git checkout with git on PATH.',
			);
		}
		const repositoryFiles = output
			.split('\0')
			.map((file) => file.replaceAll('\\', '/'))
			.filter((file) => file !== '' && !isIgnored(file));
		const existingFiles: string[] = [];
		for (const file of repositoryFiles) {
			// `git ls-files --cached` includes tracked paths deleted only in the worktree. They must
			// invalidate an older cache entry, but they cannot be inputs to the fresh result being
			// recorded after a successful test run.
			if (await pathExists(resolve(projectRoot, file))) existingFiles.push(file);
		}
		return existingFiles;
	};

	if (context === undefined) return await collect();
	context.repositoryFiles ??= collect();
	return await context.repositoryFiles;
}

export async function collectDependencies(
	projectRoot: string,
	step: string,
	context?: SmokeCacheEvaluationContext,
): Promise<string[]> {
	if (step === 'format:check') {
		return await collectPrettierDependencies(projectRoot, STEP_DEPENDENCIES[step] ?? []);
	}

	const allowGeneratedOutput = isGeneratedOutputStep(step);
	const patterns = [
		...(STEP_DEPENDENCIES[step] ?? []),
		...(step === TEST_STEP_NAME ? TEST_RUNTIME_INPUTS : []),
	];
	const files = new Set<string>();
	if (step === TEST_STEP_NAME) {
		// Coverage sees imported modules, but many contract tests intentionally inspect source and
		// documentation as text. The Git worktree inventory captures those dynamic reads without
		// making every test declare a second, easy-to-drift dependency list.
		for (const file of await collectRepositoryFiles(projectRoot, context)) files.add(file);
	}

	for (const pattern of patterns) {
		if (!pattern.includes('*')) {
			const absolutePath = resolve(projectRoot, pattern);
			if (await pathExists(absolutePath)) {
				files.add(relative(projectRoot, absolutePath));
			}
			continue;
		}

		for (const file of await scanGlob(projectRoot, pattern, allowGeneratedOutput, context)) {
			files.add(file);
		}
	}

	return [...files].filter((file) => !isIgnored(file, allowGeneratedOutput)).sort();
}

export async function hashDependencies(
	projectRoot: string,
	dependencies: string[],
	allowGeneratedOutput = false,
	context?: SmokeCacheEvaluationContext,
): Promise<null | string> {
	const hash = createHash('sha256');
	const normalizedDependencies = [
		...new Set(dependencies.map((file) => file.replaceAll('\\', '/'))),
	]
		.filter((file) => !isIgnored(file, allowGeneratedOutput))
		.sort();

	for (const dependency of normalizedDependencies) {
		const absolutePath = resolve(projectRoot, dependency);
		const stats = await stat(absolutePath).catch((err: unknown) => {
			if (err instanceof Error && 'code' in err && err.code === 'ENOENT') return null;
			throw err;
		});
		if (stats === null) return null;
		const cached = context?.fileReads.get(absolutePath);
		const contents =
			cached !== undefined &&
			cached.ctimeMs === stats.ctimeMs &&
			cached.mtimeMs === stats.mtimeMs &&
			cached.size === stats.size
				? cached.contents
				: await readFile(absolutePath);
		if (context !== undefined && contents !== cached?.contents) {
			context.fileReads.set(absolutePath, {
				contents,
				ctimeMs: stats.ctimeMs,
				mtimeMs: stats.mtimeMs,
				size: stats.size,
			});
		}
		hash.update(dependency);
		hash.update('\0');
		hash.update(contents);
		hash.update('\0');
	}

	return hash.digest('hex');
}

export async function hashStepDependencies(
	projectRoot: string,
	step: string,
	context?: SmokeCacheEvaluationContext,
): Promise<null | string> {
	return await hashDependencies(
		projectRoot,
		await collectDependencies(projectRoot, step, context),
		isGeneratedOutputStep(step),
		context,
	);
}
