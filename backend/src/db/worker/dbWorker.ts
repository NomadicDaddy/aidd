import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';

import {
	createInProcessCommands,
	type DbCommandMap,
	type DbCommandName,
	type DbCommands,
} from '../commands.ts';
import { migrateWebDatabase } from '../migrate.ts';
import { applyConnectionPragmas } from '../pragmas.ts';
import * as schema from '../schema.ts';
import { executeStatement } from '../statement.ts';
import { acquireWriterLock, type WriterLock } from '../writerLock.ts';
import { serializeError, type WorkerRequest, type WorkerResponse } from './protocol.ts';

// The DB worker owns the only write-capable bun:sqlite connection. Keeping every read, write,
// and transaction here means none of them ever runs on the main event loop, which is what
// caused HTTP handlers to stall behind audit-fan-out write bursts. The worker is single-
// threaded and processes messages FIFO, so each command's BEGIN…COMMIT completes atomically
// with no possibility of another statement interleaving on the shared connection.
const workerScope = globalThis as unknown as {
	onmessage: ((event: { data: WorkerRequest }) => void) | null;
	postMessage(message: WorkerResponse): void;
};

let sqlite: Database | null = null;
let writerLock: null | WriterLock = null;
let commands: DbCommands | null = null;

function handleInit(path: string): void {
	try {
		// Acquire BEFORE opening so a losing second backend never establishes a write-capable
		// handle. Throws here if another live backend already owns the database.
		writerLock = acquireWriterLock(path);
		sqlite = new Database(path);
		applyConnectionPragmas(sqlite);
		migrateWebDatabase(sqlite);
		commands = createInProcessCommands(drizzle(sqlite, { schema }));
		workerScope.postMessage({ kind: 'ready' });
	} catch (err) {
		writerLock?.release();
		writerLock = null;
		workerScope.postMessage({ error: serializeError(err), kind: 'init-error' });
	}
}

async function runCommand(name: DbCommandName, args: unknown): Promise<unknown> {
	if (!commands)
		throw new Error('DB worker connection is not available (uninitialized or closed).');
	// Args arrive untyped across the structured-clone boundary; each case restores the type the
	// command facade declares. The exhaustive switch makes adding a command without a handler a
	// compile error.
	switch (name) {
		case 'claimScheduledTask':
			return commands.claimScheduledTask(args as DbCommandMap['claimScheduledTask']['args']);
		case 'finishScheduledExecution':
			return commands.finishScheduledExecution(
				args as DbCommandMap['finishScheduledExecution']['args'],
			);
		case 'insertQueuedRun':
			return commands.insertQueuedRun(args as DbCommandMap['insertQueuedRun']['args']);
		case 'markRunStale':
			return commands.markRunStale(args as DbCommandMap['markRunStale']['args']);
		case 'persistCycleResult':
			return commands.persistCycleResult(args as DbCommandMap['persistCycleResult']['args']);
		case 'promoteOldestQueuedRun':
			return commands.promoteOldestQueuedRun(
				args as DbCommandMap['promoteOldestQueuedRun']['args'],
			);
		case 'purgeProjectRuns':
			return commands.purgeProjectRuns(args as DbCommandMap['purgeProjectRuns']['args']);
		case 'reconcileDeadRun':
			return commands.reconcileDeadRun(args as DbCommandMap['reconcileDeadRun']['args']);
		case 'reconcileDiaryEntries':
			return commands.reconcileDiaryEntries(
				args as DbCommandMap['reconcileDiaryEntries']['args'],
			);
		case 'reconcileInvocationFromRun':
			return commands.reconcileInvocationFromRun(
				args as DbCommandMap['reconcileInvocationFromRun']['args'],
			);
		case 'reconcileStaleInvocations':
			return commands.reconcileStaleInvocations(
				args as DbCommandMap['reconcileStaleInvocations']['args'],
			);
		case 'releaseRunReservation':
			return commands.releaseRunReservation(
				args as DbCommandMap['releaseRunReservation']['args'],
			);
		case 'setRunPid':
			return commands.setRunPid(args as DbCommandMap['setRunPid']['args']);
		case 'startDirectorCycleIfIdle':
			return commands.startDirectorCycleIfIdle(
				args as DbCommandMap['startDirectorCycleIfIdle']['args'],
			);
		case 'terminalizeRun':
			return commands.terminalizeRun(args as DbCommandMap['terminalizeRun']['args']);
		case 'updateProjectPathReferences':
			return commands.updateProjectPathReferences(
				args as DbCommandMap['updateProjectPathReferences']['args'],
			);
		case 'writeScheduledTask':
			return commands.writeScheduledTask(args as DbCommandMap['writeScheduledTask']['args']);
		default: {
			const exhaustive: never = name;
			throw new Error(`DB worker received unknown command: ${String(exhaustive)}`);
		}
	}
}

function handleClose(id: number): void {
	try {
		// Drop the command facade first so any stmt/cmd that races in after close (before the main
		// thread terminates the worker) is rejected by the guards rather than running against a
		// closed connection.
		commands = null;
		if (sqlite) {
			// Collapse the WAL back into the main db on a clean exit so it never lingers large.
			sqlite.exec('PRAGMA wal_checkpoint(TRUNCATE);');
			sqlite.close();
			sqlite = null;
		}
		writerLock?.release();
		writerLock = null;
		workerScope.postMessage({ id, kind: 'result', ok: true, value: null });
	} catch (err) {
		workerScope.postMessage({ error: serializeError(err), id, kind: 'result', ok: false });
	}
}

workerScope.onmessage = (event): void => {
	const message = event.data;
	if (message.kind === 'init') {
		handleInit(message.path);
		return;
	}
	if (message.kind === 'close') {
		handleClose(message.id);
		return;
	}
	const { id } = message;
	if (message.kind === 'stmt') {
		try {
			if (!sqlite) {
				throw new Error('DB worker connection is not available (uninitialized or closed).');
			}
			const value = executeStatement(sqlite, message.sql, message.params, message.method);
			workerScope.postMessage({ id, kind: 'result', ok: true, value });
		} catch (err) {
			workerScope.postMessage({
				error: serializeError(err),
				id,
				kind: 'result',
				ok: false,
			});
		}
		return;
	}
	// kind === 'cmd'
	runCommand(message.name, message.args)
		.then((value) => {
			workerScope.postMessage({ id, kind: 'result', ok: true, value });
		})
		.catch((error: unknown) => {
			workerScope.postMessage({
				error: serializeError(error),
				id,
				kind: 'result',
				ok: false,
			});
		});
};
