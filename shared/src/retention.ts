const DAY_MS = 24 * 60 * 60 * 1_000;

/** Terminal run transcripts expire after 90 days, subject to the storage cap below. */
export const TRANSCRIPT_MAX_AGE_MS = 90 * DAY_MS;
/** Total retained run-transcript storage, across active and terminal runs. */
export const TRANSCRIPT_MAX_BYTES = 1024 * 1024 * 1024;
/** Terminal run, pipeline-session, and invocation history expires after one year. */
export const EXECUTION_HISTORY_MAX_AGE_MS = 365 * DAY_MS;

/** Detached backend logs rotate at 10 MiB and retain five archives for at most 30 days. */
export const BACKEND_LOG_MAX_BYTES = 10 * 1024 * 1024;
export const BACKEND_LOG_MAX_ARCHIVES = 5;
export const BACKEND_LOG_ARCHIVE_MAX_AGE_MS = 30 * DAY_MS;
