-- 0012: a run started on a substitute because the backend it asked for was resting records that
-- here, as one sentence ("codex, substituted for claude-code: resting until 17:40 (rate limit)").
-- NULL means the run ran on the backend it asked for, which is every row written before this.
ALTER TABLE runs ADD COLUMN backend_substitution TEXT;
