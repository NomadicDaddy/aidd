import { appendFileSync, mkdirSync, renameSync, statSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';

import type { AiddMode } from '../plan/types.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AiCallSource = 'aidd' | 'direct';

export type AiCallSurface =
	| 'audit'
	| 'coding'
	| 'directive'
	| 'director_chat'
	| 'director_cycle'
	| 'director'
	| 'interview'
	| 'project_recommendation'
	// 'role' surfaces no longer launch (role mode removed); the literal stays out of the union —
	// historical log entries carrying it are read as plain strings, not re-normalized here.
	| 'run_summary'
	| 'todo'
	| 'triumvirate'
	| 'unknown'
	| 'validate';

export interface AiCallLogEntry {
	/** Wall-clock duration of the call in milliseconds. */
	durationMs: number;
	/** Error message if the call failed. */
	error?: string;
	/**
	 * Flattened `error.cause` chain messages (outermost → innermost), if any.
	 * Transport failures (e.g. Bun's socket timeout) bury the real reason here;
	 * `error.message` alone reads as a bare "The operation timed out".
	 */
	errorCause?: string;
	/** Machine-readable error code if present (e.g. `ETIMEDOUT`, `ConnectionClosed`). */
	errorCode?: string;
	/** Error constructor name (e.g. `TimeoutError`, `DOMException`), if the call failed. */
	errorName?: string;
	/** Host portion of the request URL (e.g. `api.z.ai`), for triaging by endpoint. */
	host?: string;
	/** Number of input/prompt tokens, if reported. */
	inputTokens?: number;
	/** Model identifier used. */
	model: string;
	/** Number of output/completion tokens, if reported. */
	outputTokens?: number;
	/** Project directory if associated with a specific project. */
	projectDir?: string;
	/** Provider name (e.g. zhipu, xai, ollama). */
	provider: string;
	/**
	 * Serialized request body size in bytes — a proxy for context size, so a
	 * timeout can be correlated with how large the turn's prompt was.
	 */
	requestBytes?: number;
	/** Run ID if associated with an aidd run. */
	runId?: string;
	/** Whether this was a direct web-backend AI call or an aidd CLI call. */
	source: AiCallSource;
	/** Whether the call completed successfully. */
	success: boolean;
	/** What surface/mode triggered the call. */
	surface: AiCallSurface;
	/** ISO 8601 timestamp of when the call completed. */
	timestamp: string;
	/** Agent-loop turn index (0-based) that issued the call, if known. */
	turn?: number;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

// Exported so the Telemetry disclosure test can assert the user-facing copy still matches the
// real rotation policy instead of hard-coding numbers that can drift out of sync.
export const DEFAULT_MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
export const DEFAULT_MAX_ROTATED_FILES = 5;
const LOG_FILE_NAME = 'ai-calls.jsonl';

// ---------------------------------------------------------------------------
// Log directory resolution
// ---------------------------------------------------------------------------

let resolvedLogDir: null | string = null;

/**
 * Set the log directory explicitly. Called during startup (both web and CLI)
 * once the project/application root is known.
 */
export function setAiCallLogDir(logDir: string): void {
	resolvedLogDir = logDir;
}

/**
 * Resolve the log directory. Falls back to `logs/` relative to cwd.
 */
function getLogDir(): string {
	return resolvedLogDir ?? resolve(process.cwd(), 'logs');
}

function getLogFilePath(): string {
	return resolve(getLogDir(), LOG_FILE_NAME);
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

let logDisabled = false;

/**
 * Disable AI call logging entirely. Used in simulation/test environments.
 */
export function disableAiCallLog(): void {
	logDisabled = true;
}

/**
 * Synchronous version for use in code paths that cannot await (e.g. stream
 * finalizers). Writes are buffered by the OS; if the process crashes before
 * flush, the last few entries may be lost.
 */
export function logAiCallSync(entry: AiCallLogEntry): void {
	if (logDisabled) return;
	try {
		const logDir = getLogDir();
		mkdirSync(logDir, { recursive: true });
		const logPath = getLogFilePath();

		// Rotation check (sync for use in non-async paths)
		let fileSize = 0;
		try {
			fileSize = statSync(logPath).size;
		} catch {
			// File doesn't exist yet — no rotation needed.
		}
		if (fileSize >= DEFAULT_MAX_FILE_SIZE_BYTES) {
			rotateSync(logDir, logPath);
		}

		const line = `${JSON.stringify(entry)}\n`;
		appendFileSync(logPath, line, 'utf8');
	} catch {
		// Swallow — the log must never break the AI call path.
	}
}

// ---------------------------------------------------------------------------
// Rotation
// ---------------------------------------------------------------------------

function rotateSync(logDir: string, currentPath: string): void {
	const oldest = `${currentPath}.${DEFAULT_MAX_ROTATED_FILES}`;
	try {
		unlinkSync(oldest);
	} catch {
		// File may not exist.
	}

	for (let i = DEFAULT_MAX_ROTATED_FILES - 1; i >= 1; i--) {
		const from = `${currentPath}.${i}`;
		const to = `${currentPath}.${i + 1}`;
		try {
			renameSync(from, to);
		} catch {
			// File may not exist.
		}
	}

	try {
		renameSync(currentPath, `${currentPath}.1`);
	} catch {
		// Best effort.
	}
}

// ---------------------------------------------------------------------------
// Helper: build an entry from common call metadata
// ---------------------------------------------------------------------------

export function modeToSurface(mode: AiddMode | undefined): AiCallSurface {
	if (!mode) return 'unknown';
	switch (mode) {
		case 'audit':
			return 'audit';
		case 'coding':
			return 'coding';
		case 'directive':
			return 'directive';
		case 'director':
			return 'director';
		case 'interview':
			return 'interview';
		case 'todo':
			return 'todo';
		case 'triumvirate':
			return 'triumvirate';
		case 'validate':
			return 'validate';
		default: {
			const _exhaustive: never = mode;
			return 'unknown';
		}
	}
}
