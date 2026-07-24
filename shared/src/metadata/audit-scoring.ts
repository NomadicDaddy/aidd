// Audit change-potential scorer. Ranks audits by likely code-change yield using audit
// definition priority, run-ledger outcomes, active feature backlog, and audit-report
// coverage. Pure scoring lives in `./audit-scoring/scorer.ts`; the collectors
// `collectProjectEvidence`, `loadAuditPriorities`, and `enumerateProjectsUnderRoots` do
// the I/O in `./audit-scoring/collectors.ts` so the scorer itself stays trivially testable.
//
// See docs/reference/audit-change-potential-ranking.md for the model and rationale.

export {
	AUDIT_RUN_SUMMARY_PATTERN,
	type ProjectAuditEvidence,
	collectProjectEvidence,
	enumerateProjectsUnderRoots,
	loadAuditPriorities,
} from './audit-scoring/collectors.ts';
export {
	type ChangePotential,
	buildScoreInput,
	compareAuditsByChangePotential,
	extractPriorityFromFrontmatter,
	scoreAudit,
} from './audit-scoring/scorer.ts';
