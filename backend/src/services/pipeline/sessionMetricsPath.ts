import { METADATA_DIR, metadataPath } from 'aidd-shared/metadata/paths';

// Session metrics live under .aidd/runtime/, not .aidd/reports/. reports/ is a durable
// deliverables namespace: skill write-ups and session reports land there, the project
// catalog lists them, and nothing ever prunes it. Per-session metrics are scratch with a
// lifetime of one pipeline run, so parking them alongside deliverables left hundreds of
// orphaned files across every project the panel had ever touched, with no owner to remove
// them. runtime/ is transient by contract and swept at boot (see sessionMetricsSweep).
//
// The extra <sessionId>/ directory level keeps the metrics file three deep, below the
// two-level scan in the CLI's fresh-artifact check — but that check also skips `runtime`
// by name, so the depth is defensive, not load-bearing.
const RUNTIME_SEGMENTS = ['runtime', 'pipeline-sessions'] as const;

/**
 * Absolute path of the directory holding every session's metrics for one project.
 * @param projectDir The project root.
 * @returns The project's pipeline-session runtime directory.
 */
export function pipelineSessionRuntimeDir(projectDir: string): string {
	return metadataPath(projectDir, ...RUNTIME_SEGMENTS);
}

/**
 * Absolute path of one session's metrics file.
 * @param projectDir The project root.
 * @param sessionId The pipeline session whose metrics file to name.
 * @returns The absolute path to that session's metrics.json.
 */
export function sessionMetricsFilePath(projectDir: string, sessionId: string): string {
	return metadataPath(projectDir, ...RUNTIME_SEGMENTS, sessionId, 'metrics.json');
}

/**
 * Project-relative path of one session's metrics file, POSIX-separated.
 *
 * This is the value substituted into recipe step config as `{sessionMetricsPath}`. Steps run
 * with the project as their working directory, and a forward-slash path reads identically in
 * a prompt and in a shell command on every platform.
 * @param sessionId The pipeline session whose metrics file to name.
 * @returns The relative path, e.g. `.aidd/runtime/pipeline-sessions/pipe_1_a/metrics.json`.
 */
export function sessionMetricsRelativePath(sessionId: string): string {
	return [METADATA_DIR, ...RUNTIME_SEGMENTS, sessionId, 'metrics.json'].join('/');
}
