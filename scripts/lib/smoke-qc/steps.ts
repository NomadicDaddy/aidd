import { FAST_QC_STEP_NAMES } from './fast-subset.ts';

/**
 * The smoke:qc step list. Kept out of the runner so scripts/smoke-qc.ts stays the thing that
 * EXECUTES steps and this stays the thing that DECLARES them — the same split spernakit gets
 * from smoke.json, which is what lets a step be added without touching runner logic.
 */
export interface SmokeQcStep {
	command: string[];
	label: string;
	name: string;
}

// Ordered by ascending expected time-to-first-failure (cost / observed failure rate),
// so a doomed run fails as early as possible: sub-second checks first (frequent
// failers leading), then format/typecheck/lint, then the test suite, and last the
// builds, which have never failed across the mined iteration sample. Re-mine
// `.aidd/iterations/*.log` for `[FAIL] <label> exited` counts before reordering.
export const SMOKE_QC_STEPS: SmokeQcStep[] = [
	{
		command: ['bun', 'run', 'check:max-lines'],
		label: 'check:max-lines',
		name: 'check:max-lines',
	},
	{
		command: ['bun', 'run', 'check:fresh-release'],
		label: 'check:fresh-release',
		name: 'check:fresh-release',
	},
	{
		command: ['bun', 'run', 'check:web-db-integrity'],
		label: 'check:web-db-integrity',
		name: 'check:web-db-integrity',
	},
	{
		command: ['bun', 'run', 'check:env-spread'],
		label: 'check:env-spread',
		name: 'check:env-spread',
	},
	{
		command: ['bun', 'run', 'check:backend-cli-boundary'],
		label: 'check:backend-cli-boundary',
		name: 'check:backend-cli-boundary',
	},
	{
		command: ['bun', 'run', 'check:schema-parity'],
		label: 'check:schema-parity',
		name: 'check:schema-parity',
	},
	{
		command: ['bun', 'run', 'check:feature-integration'],
		label: 'check:feature-integration',
		name: 'check:feature-integration',
	},
	{
		command: ['bun', 'run', 'check:artifact-parity'],
		label: 'check:artifact-parity',
		name: 'check:artifact-parity',
	},
	{
		command: ['bun', 'run', 'check:audit-artifact-hygiene'],
		label: 'check:audit-artifact-hygiene',
		name: 'check:audit-artifact-hygiene',
	},
	{
		command: ['bun', 'run', 'check:audit-profile-mapping'],
		label: 'check:audit-profile-mapping',
		name: 'check:audit-profile-mapping',
	},
	{
		command: ['bun', 'run', 'check-application'],
		label: 'check-application',
		name: 'check-application',
	},
	{
		command: ['bun', 'run', 'check-deps'],
		label: 'check-deps',
		name: 'check-deps',
	},
	{
		command: ['bun', 'run', 'check:dead-code'],
		label: 'check:dead-code',
		name: 'check:dead-code',
	},
	{
		command: ['bun', 'run', 'self-contained'],
		label: 'self-contained',
		name: 'self-contained',
	},
	{
		command: ['bun', 'run', 'check:licenses'],
		label: 'check:licenses',
		name: 'check:licenses',
	},
	{
		command: ['bun', 'run', 'prompt:snapshot:check'],
		label: 'prompt:snapshot:check',
		name: 'prompt:snapshot:check',
	},
	{
		command: ['bun', 'run', 'check:leak-guard'],
		label: 'check:leak-guard',
		name: 'check:leak-guard',
	},
	{
		command: ['bun', 'run', 'format:check'],
		label: 'format:check',
		name: 'format:check',
	},
	{
		command: ['bun', 'run', 'typecheck'],
		label: 'typecheck',
		name: 'typecheck',
	},
	{
		command: ['bun', 'run', 'lint'],
		label: 'lint',
		name: 'lint',
	},
	{
		command: ['bun', 'run', 'test:coverage'],
		label: 'bun test',
		name: 'test',
	},
	// build:shared/build:backend/build:cli are absent on purpose: those workspace "build"
	// scripts are `tsc -p` against noEmit configs whose options match the root tsconfig,
	// so the typecheck step already covers them exactly. build:frontend (vite) is the
	// only step that emits artifacts.
	{
		command: ['bun', 'run', 'build:frontend'],
		label: 'build:frontend',
		name: 'build:frontend',
	},
	// Both must follow build:frontend: they read its output. They are complementary, not
	// redundant — verify-minification caps TOTAL bytes, check:critical-path guards the SHAPE of
	// the first load. A regression that moves the React runtime out of a preloaded chunk costs a
	// round trip while leaving total bytes unchanged, so only the second can see it.
	{
		command: ['bun', 'run', 'verify-minification'],
		label: 'verify-minification',
		name: 'verify-minification',
	},
	{
		command: ['bun', 'run', 'check:critical-path'],
		label: 'check:critical-path',
		name: 'check:critical-path',
	},
];

// Defined in ./lib/smoke-qc/fast-subset.ts, which carries the measurements behind the order.
export { FAST_QC_STEP_NAMES };

export const FAST_QC_STEPS: SmokeQcStep[] = FAST_QC_STEP_NAMES.map((name) => {
	const step = SMOKE_QC_STEPS.find((candidate) => candidate.name === name);
	if (step === undefined) {
		throw new Error(`smoke-qc: fast step '${name}' is not a smoke:qc step`);
	}
	return step;
});
