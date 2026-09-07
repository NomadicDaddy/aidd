// Detection + revert layer for metadata-only pipeline sessions. Uses the shared
// write-allowlist guard (snapshot/diff/revert) so the pipeline backstop enforces
// identically to the CLI-level --write-allowlist guard.
//
// The captureWorktreeSnapshot/findMetadataViolations pair is a thin path-membership view
// over the shared implementation for callers (tests included) that only need the dirty-paths
// set. New code should call the shared functions directly.

import { captureWriteGuardSnapshot } from 'aidd-shared/pipeline/writeAllowlist';

const METADATA_ALLOWLIST = ['.aidd'];

// Minimal interface for callers that only need the dirty-paths set.
export interface WorktreeSnapshot {
	dirtyPaths: Set<string>;
}

// Wraps the shared WriteGuardSnapshot in the WorktreeSnapshot shape callers and tests
// consume. Returns null for non-git projects.
export async function captureWorktreeSnapshot(
	projectDir: string,
): Promise<null | WorktreeSnapshot> {
	const snapshot = await captureWriteGuardSnapshot(projectDir);
	if (snapshot === null) return null;
	return { dirtyPaths: new Set(snapshot.entries.keys()) };
}

// Violation finder that only checks path membership (no revert). Returns
// the violating paths.
export function findMetadataViolations(
	before: WorktreeSnapshot,
	after: WorktreeSnapshot,
): string[] {
	const violations: string[] = [];
	for (const path of after.dirtyPaths) {
		if (before.dirtyPaths.has(path)) continue;
		if (path.startsWith(`${METADATA_ALLOWLIST[0]}/`)) continue;
		if (path === METADATA_ALLOWLIST[0]) continue;
		violations.push(path);
	}
	return violations.sort();
}

export { METADATA_ALLOWLIST };
