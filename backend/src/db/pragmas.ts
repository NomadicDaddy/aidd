import type { Database } from 'bun:sqlite';

// Connection-level tuning for a single-writer, many-reader control plane. WAL lets readers
// (run lists, telemetry aggregation, fleet summaries) run concurrently with the writer instead
// of blocking on a rollback-journal lock. synchronous=NORMAL is the standard safe pairing with
// WAL (fsync at checkpoint, not every commit); only an OS/power loss can drop the last
// transaction, which is acceptable for run/telemetry state. journal_size_limit caps the -wal
// file so a write burst doesn't leave it permanently large. journal_mode is persisted in the
// file header, but the rest are per-connection and must be set on every open.
//
// busy_timeout is deliberately short (1s): a contended call blocks the calling thread
// synchronously for the whole timeout, so a long wait stalls the DB worker's serial queue.
// withSqliteRetry (db/retry.ts) absorbs transient SQLITE_BUSY/SQLITE_BUSY_SNAPSHOT with a
// non-blocking jittered backoff instead, which is strictly better than a multi-second
// synchronous busy-wait.
//
// Invariant that makes the short timeout safe even for raw (un-retried) statements: this is the
// single write-capable connection (the worker owns it; the writer lock blocks a second backend),
// and all statements execute FIFO on it, so SQLite never raises SQLITE_BUSY from internal
// contention. Reads get WAL snapshot isolation and never block on the writer. SQLITE_BUSY is thus
// confined to genuine cross-process lock windows, which withSqliteRetry-wrapped writes handle.
export function applyConnectionPragmas(sqlite: Database): void {
	sqlite.exec('PRAGMA journal_mode = WAL;');
	sqlite.exec('PRAGMA busy_timeout = 1000;');
	sqlite.exec('PRAGMA synchronous = NORMAL;');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	sqlite.exec('PRAGMA wal_autocheckpoint = 1000;');
	sqlite.exec('PRAGMA journal_size_limit = 67108864;');
}
