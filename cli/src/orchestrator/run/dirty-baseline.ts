import { join } from 'node:path';

import type { RunAccumulator } from './types.ts';

import { gitDirtySourcePaths, isAiddMetadataPath } from './git.ts';

/**
 * Content of the `.aidd` records that are already dirty, keyed by path.
 *
 * Content rather than presence: approving a feature in the web panel rewrites its record moments
 * before the run is launched, so the path alone is dirty at the start of most runs. Reading that
 * as "the operator's, leave it" meant the run's own later write to the same record was never
 * committed, which is the dirt this baseline exists to let run end clear.
 * @param projectDir The repository the run works in.
 * @param paths Dirty metadata paths from the run-start status.
 * @returns Path to content hash; unreadable files are omitted.
 */
async function hashDirtyMetadata(
	projectDir: string,
	paths: readonly string[],
): Promise<Map<string, string>> {
	const hashes = new Map<string, string>();
	for (const path of paths) {
		try {
			const bytes = await Bun.file(join(projectDir, path)).arrayBuffer();
			hashes.set(path, Bun.SHA256.hash(new Uint8Array(bytes), 'hex'));
		} catch {
			// A record that cannot be read now cannot be compared later either.
		}
	}
	return hashes;
}

/**
 * Capture the run-start baseline for writeRunSummary's run-end checks: any non-.aidd path already
 * dirty here is operator state the run must neither flag nor commit, and every dirty `.aidd`
 * record is remembered by content so run end can tell its own writes from what it found.
 *
 * When git status fails (not a repository) the baselines stay unset and both checks are skipped
 * rather than misattributing existing dirt to the run.
 * @param acc The run accumulator the baselines are recorded on.
 * @param projectDir The repository the run works in.
 */
export async function captureDirtySourceBaseline(
	acc: RunAccumulator,
	projectDir: string,
): Promise<void> {
	// One status call for both baselines.
	const baseline = await gitDirtySourcePaths(projectDir, { includeAiddMetadata: true });
	if (baseline === undefined) return;
	acc.dirtySourcePathsAtStart = new Set(baseline.filter((path) => !isAiddMetadataPath(path)));
	acc.dirtyMetadataAtStart = await hashDirtyMetadata(
		projectDir,
		baseline.filter((path) => isAiddMetadataPath(path)),
	);
}
