// Re-export the shared canonical write-allowlist guard so CLI and pipeline-level metadata-only
// enforcement use the same snapshot/diff/revert implementation without cross-workspace imports.
export {
	buildWriteAllowlistRetryPrompt,
	captureWriteGuardSnapshot,
	diffWriteViolations,
	formatViolationPaths,
	revertWriteViolations,
	type WriteGuardSnapshot,
} from 'aidd-shared/pipeline/writeAllowlist';
