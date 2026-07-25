import type { DbCommandName } from '../commands.ts';
import type { SqlMethod } from '../statement.ts';

// Wire protocol between the main thread and the DB worker. All payloads are plain,
// structured-clone-safe objects (numbers, strings, null, arrays, plain records).

export interface InitRequest {
	kind: 'init';
	path: string;
}

export interface StmtRequest {
	id: number;
	kind: 'stmt';
	method: SqlMethod;
	params: unknown[];
	sql: string;
}

export interface CmdRequest {
	args: unknown;
	id: number;
	kind: 'cmd';
	name: DbCommandName;
}

export interface CloseRequest {
	id: number;
	kind: 'close';
}

export type WorkerRequest = CloseRequest | CmdRequest | InitRequest | StmtRequest;

export interface ReadyMessage {
	kind: 'ready';
}

export interface InitErrorMessage {
	error: SerializedError;
	kind: 'init-error';
}

export interface SuccessResponse {
	id: number;
	kind: 'result';
	ok: true;
	value: unknown;
}

export interface ErrorResponse {
	error: SerializedError;
	id: number;
	kind: 'result';
	ok: false;
}

export type WorkerResponse = ErrorResponse | InitErrorMessage | ReadyMessage | SuccessResponse;

// Error subclasses do not survive structured clone with their custom fields, so the retryable
// `code` (e.g. SQLITE_BUSY) is serialized explicitly and reattached on the main thread — that
// code is what withSqliteRetry keys off to retry transient lock contention.
export interface SerializedError {
	code?: string;
	message: string;
	stack?: string;
}

export function serializeError(error: unknown): SerializedError {
	if (error instanceof Error) {
		const code = (error as { code?: unknown } & Error).code;
		return {
			message: error.message,
			...(typeof code === 'string' ? { code } : {}),
			...(error.stack ? { stack: error.stack } : {}),
		};
	}
	return { message: String(error) };
}

export function deserializeError(error: SerializedError): Error {
	const reconstructed = new Error(error.message) as { code?: string } & Error;
	if (error.code !== undefined) reconstructed.code = error.code;
	if (error.stack !== undefined) reconstructed.stack = error.stack;
	return reconstructed;
}
