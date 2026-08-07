/**
 * Shared types for the gate-conventions meta-gate.
 *
 * The rule numbers here are the rule numbers in `docs/reference/gate-conventions.md`, which is the
 * document this code enforces. Six of the eight rules are statically decidable; rules 5
 * (anti-vacuity) and 7 (waiver forms) are reviewed by hand during the phase-2 migration because
 * neither can be decided from source text without knowing what the gate examines.
 */

/** The statically enforced rules. Deliberately sparse: 5 and 7 have no static form. */
export type RuleId = 'GC1' | 'GC2' | 'GC3' | 'GC4' | 'GC6' | 'GC8';

export const STATIC_RULES: readonly RuleId[] = ['GC1', 'GC2', 'GC3', 'GC4', 'GC6', 'GC8'];

export const RULE_TITLES: Record<RuleId, string> = {
	GC1: 'entry shape',
	GC2: 'exit codes',
	GC3: 'output',
	GC4: 'arguments',
	GC6: 'rule linkage',
	GC8: '--json shape',
};

export interface Finding {
	/** 1-indexed line in `path`, or 0 when the finding is about the file as a whole. */
	line: number;
	message: string;
	/** Repo-relative, forward slashes. */
	path: string;
	rule: RuleId;
}

export interface Gate {
	/** Repo-relative, forward slashes. */
	path: string;
	source: string;
	/** The `check*` task names in package.json that run this file, sorted. */
	tasks: string[];
}
