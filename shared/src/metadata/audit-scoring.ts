// Audit change-potential scorer. Ranks audits by likely code-change yield using audit
// definition priority, run-ledger outcomes, active feature backlog, and audit-report
// coverage. Pure scoring lives in `./audit-scoring/scorer.ts`; the collectors
// `collectProjectEvidence`, `loadAuditPriorities`, and `enumerateProjectsUnderRoots` do
// the I/O in `./audit-scoring/collectors.ts` so the scorer itself stays trivially testable.
//
// See docs/reference/audit-change-potential-ranking.md for the model and rationale.

export {
	collectProjectEvidence,
	enumerateProjectsUnderRoots,
	loadAuditPriorities,
	type ProjectAuditEvidence,
} from './audit-scoring/collectors.ts';
export {
	buildScoreInput,
	type ChangePotential,
	compareAuditsByChangePotential,
	extractPriorityFromFrontmatter,
	scoreAudit,
} from './audit-scoring/scorer.ts';
