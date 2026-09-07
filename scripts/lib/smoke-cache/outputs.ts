import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';

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
	'build:analyze': ['data/build-analysis'],
	'build:frontend': ['frontend/dist'],
	// Not emitters, but they READ frontend/dist. They hash it too (GENERATED_OUTPUT_STEPS), and
	// this covers the case hashing cannot: an empty dist has no files, so it produces no hash
	// change — only an existence check can tell "unchanged" from "gone".
	'check:critical-path': ['frontend/dist'],
	'check:media-provenance': ['frontend/dist'],
	'verify-minification': ['frontend/dist'],
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

		// A file output is proven by its existence; only a directory can exist yet be empty,
		// which is what `rm -rf dist/*` and a half-finished build both leave behind.
		if (stats.isDirectory() && !(await directoryHasFiles(outputPath))) return false;
	}

	return true;
}
