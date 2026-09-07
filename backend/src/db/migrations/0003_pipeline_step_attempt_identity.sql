-- 0003: persisted attempt identity on pipeline_step_results.
--
-- executeStep owned retry dispatch inside a single result row: a step with retryCount, or with
-- onFailure 'auto-fix', persisted ONE row whose status was the last attempt's outcome, and every
-- earlier failure vanished. AutoFixRunner meanwhile persisted its remediation as a child row, so
-- the two halves of one retry cycle were recorded in two different shapes with nothing to group
-- them by -- phase reads 'step' on both, and duplicate rows left by historical duplicate
-- executions look exactly the same as a genuine retry.
--
-- attempt_number is the one-based ordinal of the attempt within its logical step. attempt_kind
-- separates an ordinary retry from the auto-fix run launched between two of them. Both stay NULL
-- on rows written before this migration and on rows that are not attempts at all (hook rows,
-- skipped steps): NULL means "no persisted attempt identity", and the session report groups those
-- rows by their structural key rather than inventing an ordinal for them.
ALTER TABLE pipeline_step_results ADD COLUMN attempt_number INTEGER
	CONSTRAINT ck_pipeline_step_results_attempt_number
	CHECK (attempt_number IS NULL OR attempt_number >= 1);

ALTER TABLE pipeline_step_results ADD COLUMN attempt_kind TEXT
	CONSTRAINT ck_pipeline_step_results_attempt_kind
	CHECK (attempt_kind IS NULL OR attempt_kind IN ('auto-fix','ordinary'));
