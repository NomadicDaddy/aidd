// Cap on the file-change path lists persisted to runs.jsonl and returned by the web API. Shared
// by the CLI (ledger writer), backend (reader/recovery), and frontend (tooltip copy) so the
// truncation behavior and its user-facing description can never drift apart.
export const fileChangePathLimit = 50;
