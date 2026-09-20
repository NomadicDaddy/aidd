-- Give the retention sweep an index it can actually use.
--
-- pruneOldMetrics deletes on `timestamp` alone, but the only index on the table leads with
-- `metric_type`, so SQLite full-scanned every row on each collection cycle and the delete showed
-- up in backend.log as a ~150ms slow query at every backend start. Reads all filter on
-- `metric_type` first, so idx_system_metrics_type_ts stays exactly as it is.

CREATE INDEX IF NOT EXISTS idx_system_metrics_ts ON system_metrics(timestamp);
