import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';

import { currentRevision, inspectAnalysis } from '../../check-bundle-analysis.ts';

/**
 * A cache hit means "the inputs are unchanged", which is only a safe reason to skip a step when
 * the step's output is still on disk. `build:frontend` hashes 408 source files and none of them
 * live under `frontend/dist`, so deleting the build output leaves the hash identical: the step
 * reports CACHED and `smoke:qc` goes green having produced nothing.
 *
 * Steps that emit artifacts therefore declare them here, and a cache hit is withheld whenever a
 * declared output is missing or empty. Ported from spernakit, which carries the same information
 * as an `outputs` field on each step's dependency record.
 */
export const STEP_OUTPUTS: Record<string, string[]> = {
	// Both files, not the directory: check:bundle-analysis needs each, and a directory holding
	// only one of them still has files in it.
	'build:analyze': [
		'data/build-analysis/frontend-stats.json',
		'data/build-analysis/frontend-stats.html',
	],
	'build:frontend': ['frontend/dist'],
	// Not emitters, but they READ frontend/dist. They hash it too (GENERATED_OUTPUT_STEPS), and
	// this covers the case hashing cannot: an empty dist has no files, so it produces no hash
	// change — only an existence check can tell "unchanged" from "gone".
	'check:critical-path': ['frontend/dist'],
	'check:media-provenance': ['frontend/dist'],
	'verify-minification': ['frontend/dist'],
};

/**
 * Outputs whose contents decide the step's own pass, checked again before a hit is replayed.
 * build:analyze passes only when check:bundle-analysis accepts its report, and nothing in the
 * cache key reads the report: a corrupt or truncated one with unchanged inputs replayed a pass
 * the step would now fail (roger, review of 04079824). The same check runs here, in milliseconds.
 */
const STEP_OUTPUT_CHECKS: Record<string, (projectRoot: string) => boolean> = {
	'build:analyze': (projectRoot) =>
		inspectAnalysis(projectRoot, currentRevision(projectRoot)).length === 0,
};

async function directoryHasFiles(directory: string): Promise<boolean> {
	// Take only the first entry: this answers "did anything get emitted", not "how much".
	const entries = new Bun.Glob('**/*').scan({ cwd: directory, onlyFiles: true });
	const first = await entries[Symbol.asyncIterator]().next();
	return first.done !== true;
}

export async function stepOutputsExist(projectRoot: string, step: string): Promise<boolean> {
	const outputs = STEP_OUTPUTS[step];
	if (outputs === undefined) return true;

	for (const output of outputs) {
		const outputPath = resolve(projectRoot, output);
		const stats = await stat(outputPath).catch(() => null);
		if (stats === null) return false;

		// An empty output is no output: a zero-byte file is what an interrupted write leaves, and
		// an empty directory is what `rm -rf dist/*` and a half-finished build leave.
		if (stats.isFile() && stats.size === 0) return false;
		if (stats.isDirectory() && !(await directoryHasFiles(outputPath))) return false;
	}

	return STEP_OUTPUT_CHECKS[step]?.(projectRoot) ?? true;
}
