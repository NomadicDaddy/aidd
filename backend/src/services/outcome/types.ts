import type { FindingLifecycleMeasures, OutcomeRate } from 'aidd-shared/outcome-measures';

export interface CostPerAcceptedFinding {
	/** Every remediated finding for the audit, costed or not. */
	acceptedFindings: number;
	/** Terminal audit runs with a recorded cost, including a recorded zero. */
	capturedRuns: number;
	/** Remediated findings whose emitting run is one of the captured runs; the value's denominator. */
	costedAcceptedFindings: number;
	totalRuns: number;
	/** Captured cost divided by costed accepted findings; null until both exist. */
	value: null | number;
}

export interface AuditOutcomeMeasures {
	acceptanceRate: OutcomeRate;
	costPerAcceptedFinding: CostPerAcceptedFinding;
	/** Projects whose findings ledger exists but could not be read; their findings are missing. */
	degradedProjects: number;
	lifecycle: FindingLifecycleMeasures;
	recurrenceRate: OutcomeRate;
}

export interface DriverRevertMeasure {
	driverId: string;
	driverSha256: string;
	revertedCommits: number;
	revertRate: OutcomeRate;
}
