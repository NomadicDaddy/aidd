/**
 * Shared types for the gate-conventions meta-gate.
 *
 * The rule numbers here are the rule numbers in `docs/reference/gate-conventions.md`, which is the
 * document this code enforces. Seven of the eight rules are statically decidable, and rule 5 only
 * in half: its count half is a property of the success line's text, while its zero-items half is a
 * property of a code path and stays a review item, alongside rule 7's waiver forms.
 */

/** The statically enforced rules. Deliberately sparse: 7 has no static form, and 5 has half of one. */
export type RuleId = 'GC1' | 'GC2' | 'GC3' | 'GC4' | 'GC5' | 'GC6' | 'GC8';

export const STATIC_RULES: readonly RuleId[] = ['GC1', 'GC2', 'GC3', 'GC4', 'GC5', 'GC6', 'GC8'];

export const RULE_TITLES: Record<RuleId, string> = {
	GC1: 'entry shape',
	GC2: 'exit codes',
	GC3: 'output',
	GC4: 'arguments',
	GC5: 'anti-vacuity',
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
