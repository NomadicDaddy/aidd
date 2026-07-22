import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';

import {
	GENERATED_OUTPUT_PREFIX,
	isGeneratedOutputStep,
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

/**
 * `frontend/dist` is normally excluded: it is generated, so hashing it into a producer's key would
 * make that step depend on its own output. Steps that CONSUME the build are the exception — a gate
 * that inspects dist and does not hash it will sit cached over a stale, partial, or hand-altered
 * artifact, which is precisely the state such a gate exists to catch.
 */
function isIgnored(relativePath: string, allowGeneratedOutput = false): boolean {
	const normalized = relativePath.replaceAll('\\', '/');
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

export async function collectDependencies(projectRoot: string, step: string): Promise<string[]> {
	if (step === 'format:check') {
		return await collectPrettierDependencies(projectRoot, STEP_DEPENDENCIES[step] ?? []);
	}

	const allowGeneratedOutput = isGeneratedOutputStep(step);
	const patterns = [
		...(STEP_DEPENDENCIES[step] ?? []),
		...(step === TEST_STEP_NAME ? TEST_RUNTIME_INPUTS : []),
	];
	const files = new Set<string>();

	for (const pattern of patterns) {
		if (!pattern.includes('*')) {
			const absolutePath = resolve(projectRoot, pattern);
			if (await pathExists(absolutePath)) {
				files.add(relative(projectRoot, absolutePath));
			}
			continue;
		}

		const glob = new Bun.Glob(pattern);
		for await (const relativePath of glob.scan({ cwd: projectRoot, onlyFiles: true })) {
			const normalized = relativePath.split(sep).join('/');
			if (!isIgnored(normalized, allowGeneratedOutput)) {
				files.add(normalized);
			}
		}
	}

	return [...files].filter((file) => !isIgnored(file, allowGeneratedOutput)).sort();
}

export async function hashDependencies(
	projectRoot: string,
	dependencies: string[],
	allowGeneratedOutput = false
): Promise<null | string> {
	const hash = createHash('sha256');
	const normalizedDependencies = [
		...new Set(dependencies.map((file) => file.replaceAll('\\', '/'))),
	]
		.filter((file) => !isIgnored(file, allowGeneratedOutput))
		.sort();

	for (const dependency of normalizedDependencies) {
		const absolutePath = resolve(projectRoot, dependency);
		if (!(await pathExists(absolutePath))) return null;
		hash.update(dependency);
		hash.update('\0');
		hash.update(await readFile(absolutePath));
		hash.update('\0');
	}

	return hash.digest('hex');
}

export async function hashStepDependencies(
	projectRoot: string,
	step: string
): Promise<null | string> {
	return await hashDependencies(
		projectRoot,
		await collectDependencies(projectRoot, step),
		isGeneratedOutputStep(step)
	);
}
