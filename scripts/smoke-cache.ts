import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import {
	collectDependencies,
	hashDependencies,
	hashStepDependencies,
} from './lib/smoke-cache/collect.ts';
import { readTestCoverageFiles } from './lib/smoke-cache/coverage.ts';
import {
	isCacheableStep,
	isGeneratedOutputStep,
	STEP_DEPENDENCIES,
	TEST_STEP_NAME,
} from './lib/smoke-cache/dependencies.ts';
import { stepOutputsExist } from './lib/smoke-cache/outputs.ts';

export type SmokeStepResult = 'fail' | 'pass';

export interface SmokeCacheEntry {
	coveredFiles?: string[];
	dependencyHash: string;
	durationMs: number;
	recordedAt: string;
	result: SmokeStepResult;
}

export interface SmokeCacheFile {
	steps: Record<string, SmokeCacheEntry>;
	updatedAt: string;
	version: 1;
}

export interface SmokeCacheStatusEntry {
	cacheable: boolean;
	dependencyCount: number;
	dependencyHash: string;
	durationMs: null | number;
	recordedAt: null | string;
	result: null | SmokeStepResult;
	step: string;
	valid: boolean;
}

const CACHE_RELATIVE_PATH = join('scripts', 'smoke-cache.json');

function cachePath(projectRoot: string): string {
	return join(projectRoot, CACHE_RELATIVE_PATH);
}

function hasTestCoverageEntry(entry: SmokeCacheEntry): boolean {
	return Array.isArray(entry.coveredFiles);
}

async function collectCacheDependencies(
	projectRoot: string,
	step: string,
	entry: null | SmokeCacheEntry,
	coveredFiles?: string[],
): Promise<string[]> {
	const baseDependencies = await collectDependencies(projectRoot, step);
	const testCoveredFiles =
		step === TEST_STEP_NAME ? (coveredFiles ?? entry?.coveredFiles ?? []) : [];
	return [...new Set([...baseDependencies, ...testCoveredFiles])].sort();
}

async function hashCacheDependencies(
	projectRoot: string,
	step: string,
	entry: null | SmokeCacheEntry,
	coveredFiles?: string[],
): Promise<null | string> {
	if (step === TEST_STEP_NAME && entry !== null && !hasTestCoverageEntry(entry)) {
		return null;
	}

	if (step !== TEST_STEP_NAME && coveredFiles === undefined) {
		return await hashStepDependencies(projectRoot, step);
	}

	return await hashDependencies(
		projectRoot,
		await collectCacheDependencies(projectRoot, step, entry, coveredFiles),
		isGeneratedOutputStep(step),
	);
}

async function readCache(projectRoot: string): Promise<SmokeCacheFile> {
	try {
		const raw = await readFile(cachePath(projectRoot), 'utf8');
		const parsed = JSON.parse(raw) as Partial<SmokeCacheFile>;
		return {
			steps: parsed.steps ?? {},
			updatedAt:
				typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date(0).toISOString(),
			version: 1,
		};
	} catch (err) {
		if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
			return {
				steps: {},
				updatedAt: new Date(0).toISOString(),
				version: 1,
			};
		}
		throw err;
	}
}

async function writeCache(projectRoot: string, cache: SmokeCacheFile): Promise<void> {
	const outputPath = cachePath(projectRoot);
	await mkdir(dirname(outputPath), { recursive: true });
	await writeFile(outputPath, `${JSON.stringify(cache, null, '\t')}\n`, 'utf8');
}

export async function canSkipStep(
	projectRoot: string,
	step: string,
	force = false,
): Promise<boolean> {
	if (force) return false;
	if (!isCacheableStep(step)) return false;

	const cache = await readCache(projectRoot);
	const entry = cache.steps[step];
	if (!entry || entry.result !== 'pass') return false;

	// Cheap existence check before the expensive re-hash: unchanged inputs do not justify a skip
	// when the artifact the step was supposed to emit is gone.
	if (!(await stepOutputsExist(projectRoot, step))) return false;

	return entry.dependencyHash === (await hashCacheDependencies(projectRoot, step, entry));
}

export async function getSmokeCacheStatus(
	projectRoot: string,
	steps = Object.keys(STEP_DEPENDENCIES),
): Promise<SmokeCacheStatusEntry[]> {
	const cache = await readCache(projectRoot);
	const entries: SmokeCacheStatusEntry[] = [];

	for (const step of steps) {
		const entry = cache.steps[step] ?? null;
		const dependencies = await collectCacheDependencies(projectRoot, step, entry);
		const dependencyHash = await hashCacheDependencies(projectRoot, step, entry);
		const outputsPresent = await stepOutputsExist(projectRoot, step);
		entries.push({
			cacheable: isCacheableStep(step),
			dependencyCount: dependencies.length,
			dependencyHash: dependencyHash ?? '',
			durationMs: entry?.durationMs ?? null,
			recordedAt: entry?.recordedAt ?? null,
			result: entry?.result ?? null,
			step,
			valid:
				isCacheableStep(step) &&
				entry?.result === 'pass' &&
				outputsPresent &&
				dependencyHash !== null &&
				entry.dependencyHash === dependencyHash,
		});
	}

	return entries;
}

export async function recordStepResult(
	projectRoot: string,
	step: string,
	result: SmokeStepResult,
	durationMs: number,
): Promise<void> {
	if (!isCacheableStep(step)) return;

	const cache = await readCache(projectRoot);
	const now = new Date().toISOString();
	const coveredFiles =
		step === TEST_STEP_NAME && result === 'pass'
			? await readTestCoverageFiles(projectRoot)
			: undefined;
	const dependencyHash = await hashCacheDependencies(projectRoot, step, null, coveredFiles);
	if (dependencyHash === null) {
		throw new Error(`Cannot cache ${step}; one or more dependency files are missing.`);
	}

	cache.steps[step] = {
		...(coveredFiles === undefined ? {} : { coveredFiles }),
		dependencyHash,
		durationMs,
		recordedAt: now,
		result,
	};
	cache.updatedAt = now;

	await writeCache(projectRoot, cache);
}

export async function recordStepSuccess(
	projectRoot: string,
	step: string,
	durationMs: number,
): Promise<void> {
	await recordStepResult(projectRoot, step, 'pass', durationMs);
}

export function getSmokeCachePath(projectRoot: string): string {
	return cachePath(projectRoot);
}
