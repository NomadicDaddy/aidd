-- 0002: a durable auto-launch decision on every completed automatic director cycle.
--
-- Before this, whether a finished automatic cycle had considered its own suggestions lived only in
-- the call that followed persistCycleResult. A restart in that gap left a completed cycle whose
-- suggestions nothing would ever look at again: auto_launch stayed NULL, which is indistinguishable
-- from "the launcher was never meant to run".
--
-- auto_launch_state is that decision, written in the same transaction as the cycle's terminal
-- update: pending (a dispatch is owed), processing (a dispatch holds it), finalized (the decision is
-- made and auto_launch records it), disabled (auto-launch was off when the cycle completed, so
-- nothing is owed). NULL keeps its old meaning for rows written before this migration.
--
-- auto_launch_bounds pins the bounds in force at completion, so a Settings change made afterwards
-- cannot widen what a historical cycle is allowed to start. auto_launch_claimed_at dates a
-- processing claim, which is what lets a claim abandoned by a dead process be taken again.
ALTER TABLE director_cycles ADD COLUMN auto_launch_state TEXT
	CONSTRAINT ck_director_cycles_auto_launch_state
	CHECK (auto_launch_state IS NULL OR auto_launch_state IN ('disabled','finalized','pending','processing'));

ALTER TABLE director_cycles ADD COLUMN auto_launch_bounds TEXT;

ALTER TABLE director_cycles ADD COLUMN auto_launch_claimed_at INTEGER;
