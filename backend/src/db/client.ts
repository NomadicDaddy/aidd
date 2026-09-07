import type { ResolvedWebConfig } from 'aidd-shared/config';

import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import {
	type AsyncRemoteCallback,
	drizzle as drizzleProxy,
	type SqliteRemoteDatabase,
} from 'drizzle-orm/sqlite-proxy';
import { mkdir } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';

import {
	createInProcessCommands,
	type DbCommandMap,
	type DbCommandName,
	type DbCommands,
} from './commands.ts';
import { applyConnectionPragmas } from './pragmas.ts';
import * as schema from './schema.ts';
import { executeStatement, type SqlMethod, type StatementResult } from './statement.ts';
import { deserializeError, type WorkerRequest, type WorkerResponse } from './worker/protocol.ts';
import { acquireWriterLock, type WriterLock } from './writerLock.ts';

// The main-thread database is a sqlite-proxy drizzle instance: it builds SQL exactly like the
// native bun-sqlite driver but delegates execution through an async callback, so no query ever
// runs on the event loop. Interactive transactions cannot ride the proxy (it would split a
// BEGIN…COMMIT across async round-trips on a shared connection); they go through `commands`
// instead — atomic handlers that run entirely inside the owning connection. See db/commands.ts.
export type WebDatabase = SqliteRemoteDatabase<typeof schema>;

export interface WebDatabaseHandle {
	/** Release the connection (and writer lock / worker) on shutdown. */
	close(): Promise<void>;
	commands: DbCommands;
	db: WebDatabase;
	path: string;
	/** Present only on the in-process path (tests/tooling); never on the worker-backed handle. */
	sqlite?: Database;
	/** Present only when opened with { acquireLock: true } on the in-process path. */
	writerLock?: undefined | WriterLock;
}

export interface CreateWebDatabaseOptions {
	/**
	 * Acquire the single-writer lock before opening the connection. The production backend uses
	 * the worker-backed path (which always locks); tests and read-only tooling leave this off.
	 */
	acquireLock?: boolean;
}

export function assertRootDataDirectory(rootDir: string, dataDir: string): string {
	const rootDataDir = resolve(rootDir, 'data');
	const resolvedDataDir = resolve(dataDir);
	const relation = relative(rootDataDir, resolvedDataDir);
	if (relation !== '' && (relation.startsWith('..') || isAbsolute(relation))) {
		const repoRelation = relative(resolve(rootDir), resolvedDataDir).replace(/\\/g, '/');
		if (repoRelation === 'backend/data' || repoRelation.startsWith('backend/data/')) {
			throw new Error(
				'web.dataDir must use the repository root data directory, not backend/data',
			);
		}
		throw new Error(`web.dataDir must be inside ${rootDataDir}`);
	}
	return resolvedDataDir;
}

// Wrap a raw bun:sqlite connection as the proxy-backed WebDatabase plus its in-process command
// facade. Used by createWebDatabase and directly by tests, so service code is exercised against
// the same async WebDatabase type it sees in production.
export function wrapWebDatabase(sqlite: Database): { commands: DbCommands; db: WebDatabase } {
	const callback = async (
		sql: string,
		params: unknown[],
		method: SqlMethod,
	): Promise<StatementResult> => executeStatement(sqlite, sql, params, method);
	// drizzle's published callback type promises `rows: any[]`, but its runtime contract for a
	// 'get' miss is `rows: undefined`; the cast bridges that single intentional gap.
	const db = drizzleProxy(callback as AsyncRemoteCallback, { schema });
	const commands = createInProcessCommands(drizzle(sqlite, { schema }));
	return { commands, db };
}

// In-process database (synchronous bun:sqlite, no worker). Used by tests and read-only tooling.
// The caller runs migrations against the exposed `sqlite` handle, preserving existing behavior.
export async function createWebDatabase(
	config: ResolvedWebConfig,
	rootDir?: string,
	options?: CreateWebDatabaseOptions,
): Promise<WebDatabaseHandle> {
	const dataDir = rootDir ? assertRootDataDirectory(rootDir, config.dataDir) : config.dataDir;
	await mkdir(dataDir, { recursive: true });
	const path = join(dataDir, 'aidd-panel.db');
	const writerLock = options?.acquireLock ? acquireWriterLock(path) : undefined;
	try {
		const sqlite = new Database(path);
		applyConnectionPragmas(sqlite);
		const { commands, db } = wrapWebDatabase(sqlite);
		return {
			close: async (): Promise<void> => {
				sqlite.close();
				writerLock?.release();
			},
			commands,
			db,
			path,
			sqlite,
			writerLock,
		};
	} catch (err) {
		writerLock?.release();
		throw err;
	}
}

interface WorkerChannel {
	onerror: ((event: { message?: string }) => void) | null;
	onmessage: ((event: { data: WorkerResponse }) => void) | null;
	postMessage(message: WorkerRequest): void;
	terminate(): void;
}

/** The worker module, resolved from this module's own URL in the source checkout. */
function dbWorkerSpecifier(): string {
	return new URL('./worker/dbWorker.ts', import.meta.url).href;
}

interface PendingRequest {
	reject: (error: unknown) => void;
	resolve: (value: unknown) => void;
}

// Production database: every statement and command round-trips to a Bun worker that owns the
// only write-capable connection, so the main event loop never blocks on SQLite. The worker
// acquires the single-writer lock and runs migrations during init; init-error (e.g. another
// live backend holds the lock) rejects here, preserving the fail-fast startup behavior.
export async function createWorkerWebDatabase(
	config: ResolvedWebConfig,
	rootDir: string,
): Promise<WebDatabaseHandle> {
	const dataDir = assertRootDataDirectory(rootDir, config.dataDir);
	await mkdir(dataDir, { recursive: true });
	const path = join(dataDir, 'aidd-panel.db');

	const worker = new Worker(dbWorkerSpecifier(), { type: 'module' });
	const channel = worker as unknown as WorkerChannel;
	const pending = new Map<number, PendingRequest>();
	let nextId = 1;
	let onReady: (() => void) | null = null;
	let onInitError: ((error: Error) => void) | null = null;

	// Without this, a worker whose module is missing or unloadable never posts ready/init-error and
	// startup hangs forever with no output.
	channel.onerror = (event): void => {
		const error = new Error(`web DB worker error: ${event.message ?? 'unknown worker error'}`);
		if (onInitError) {
			onInitError(error);
			return;
		}
		for (const [id, entry] of pending) {
			pending.delete(id);
			entry.reject(error);
		}
	};

	channel.onmessage = (event): void => {
		const message = event.data;
		if (message.kind === 'ready') {
			onReady?.();
			return;
		}
		if (message.kind === 'init-error') {
			onInitError?.(deserializeError(message.error));
			return;
		}
		const entry = pending.get(message.id);
		if (!entry) return;
		pending.delete(message.id);
		if (message.ok) entry.resolve(message.value);
		else entry.reject(deserializeError(message.error));
	};

	await new Promise<void>((resolvePromise, rejectPromise) => {
		onReady = resolvePromise;
		onInitError = rejectPromise;
		channel.postMessage({ kind: 'init', path });
	});
	onReady = null;
	onInitError = null;

	const send = (build: (id: number) => WorkerRequest): Promise<unknown> => {
		const id = nextId++;
		return new Promise<unknown>((resolvePromise, rejectPromise) => {
			pending.set(id, { reject: rejectPromise, resolve: resolvePromise });
			channel.postMessage(build(id));
		});
	};

	const callback = (
		sql: string,
		params: unknown[],
		method: SqlMethod,
	): Promise<StatementResult> =>
		send((id) => ({ id, kind: 'stmt', method, params, sql })) as Promise<StatementResult>;
	const db = drizzleProxy(callback as AsyncRemoteCallback, { schema });

	const call = <K extends DbCommandName>(
		name: K,
		args: DbCommandMap[K]['args'],
	): Promise<DbCommandMap[K]['result']> =>
		send((id) => ({ args, id, kind: 'cmd', name })) as Promise<DbCommandMap[K]['result']>;

	const commands: DbCommands = {
		claimScheduledTask: (args) => call('claimScheduledTask', args),
		finishScheduledExecution: (args) => call('finishScheduledExecution', args),
		insertRunIfUnderCeiling: (args) => call('insertRunIfUnderCeiling', args),
		markRunStale: (args) => call('markRunStale', args),
		persistCycleResult: (args) => call('persistCycleResult', args),
		purgeProjectRuns: (args) => call('purgeProjectRuns', args),
		reconcileDeadRun: (args) => call('reconcileDeadRun', args),
		reconcileDiaryEntries: (args) => call('reconcileDiaryEntries', args),
		reconcileInvocationFromRun: (args) => call('reconcileInvocationFromRun', args),
		reconcileStaleInvocations: (args) => call('reconcileStaleInvocations', args),
		releaseRunReservation: (args) => call('releaseRunReservation', args),
		setRunPid: (args) => call('setRunPid', args),
		startDirectorCycleIfIdle: (args) => call('startDirectorCycleIfIdle', args),
		terminalizeRun: (args) => call('terminalizeRun', args),
		updateProjectPathReferences: (args) => call('updateProjectPathReferences', args),
		writeScheduledTask: (args) => call('writeScheduledTask', args),
	};

	return {
		close: async (): Promise<void> => {
			await send((id) => ({ id, kind: 'close' }));
			channel.terminate();
		},
		commands,
		db,
		path,
	};
}
