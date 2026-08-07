import { FAST_QC_STEP_NAMES } from './fast-subset.ts';

/**
 * The smoke:qc step list. Kept out of the runner so scripts/smoke-qc.ts stays the thing that
 * EXECUTES steps and this stays the thing that DECLARES them — the same split spernakit gets
 * from smoke.json, which is what lets a step be added without touching runner logic.
 */
export interface SmokeQcStep {
	command: string[];
	/**
	 * One operator-facing line saying what the step asserts. `sync-smoke-docs.ts` renders these into
	 * `scripts/smoke-qc.md`, so this is the runbook text and not an inline comment: a reader who
	 * wants to know why a step exists reads the generated doc rather than this file.
	 */
	description: string;
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
		description: 'No tracked source file exceeds the 300-line modularity ceiling',
		label: 'check:max-lines',
		name: 'check:max-lines',
	},
	{
		command: ['bun', 'run', 'check:script-targets'],
		description: 'Every package.json script resolves to a real file and a defined task',
		label: 'check:script-targets',
		name: 'check:script-targets',
	},
	{
		command: ['bun', 'run', 'check:smoke-docs'],
		description: 'scripts/smoke-qc.md describes the steps this registry actually declares',
		label: 'check:smoke-docs',
		name: 'check:smoke-docs',
	},
	{
		command: ['bun', 'run', 'test:gate-conventions'],
		description: 'The gate rule library still fails a deliberately non-conforming fixture',
		label: 'test:gate-conventions',
		name: 'test:gate-conventions',
	},
	{
		command: ['bun', 'run', 'check:gate-conventions'],
		description: 'Every gate follows the conventions in docs/reference/gate-conventions.md',
		label: 'check:gate-conventions',
		name: 'check:gate-conventions',
	},
	{
		command: ['bun', 'run', 'check:fresh-release'],
		description: 'A fresh release presents parseable, append-safe artifacts (DATA-003)',
		label: 'check:fresh-release',
		name: 'check:fresh-release',
	},
	{
		command: ['bun', 'run', 'check:web-db-integrity'],
		description: 'Every project reference a run or pipeline row carries resolves (DATA-007)',
		label: 'check:web-db-integrity',
		name: 'check:web-db-integrity',
	},
	{
		command: ['bun', 'run', 'check:env-spread'],
		description: 'Child processes receive only the environment they need (SEC-002)',
		label: 'check:env-spread',
		name: 'check:env-spread',
	},
	{
		command: ['bun', 'run', 'check:git-window-hide'],
		description: 'Direct Git subprocesses hide their Windows console window (SEC-006)',
		label: 'check:git-window-hide',
		name: 'check:git-window-hide',
	},
	{
		command: ['bun', 'run', 'check:backend-cli-boundary'],
		description: 'aidd-backend never imports aidd-cli, which would close a cycle (QUAL-004)',
		label: 'check:backend-cli-boundary',
		name: 'check:backend-cli-boundary',
	},
	{
		command: ['bun', 'run', 'check:schema-parity'],
		description: 'The migrations produce the database the Drizzle schema declares (DATA-006)',
		label: 'check:schema-parity',
		name: 'check:schema-parity',
	},
	{
		command: ['bun', 'run', 'check:feature-integration'],
		description: 'Every route plugin and page is registered somewhere (QUAL-004)',
		label: 'check:feature-integration',
		name: 'check:feature-integration',
	},
	{
		command: ['bun', 'run', 'check:artifact-parity'],
		description:
			'artifacts.md is the whole .aidd catalog and scaffolding/.gitignore its projection',
		label: 'check:artifact-parity',
		name: 'check:artifact-parity',
	},
	{
		command: ['bun', 'run', 'check:audit-artifact-hygiene'],
		description: 'Audit findings stay distinct, well-formed, and never future-dated (BEH-004)',
		label: 'check:audit-artifact-hygiene',
		name: 'check:audit-artifact-hygiene',
	},
	{
		command: ['bun', 'run', 'check:audit-profile-mapping'],
		description: 'The audit profile mapping parses and every audit it names exists',
		label: 'check:audit-profile-mapping',
		name: 'check:audit-profile-mapping',
	},
	{
		command: ['bun', 'run', 'check-application'],
		description:
			'Databases and runtime state live in the repository-root data/ tree (DATA-001)',
		label: 'check-application',
		name: 'check-application',
	},
	{
		command: ['bun', 'run', 'check-deps'],
		description:
			'Workspaces agree on each shared dependency and the lockfile parses (QUAL-003)',
		label: 'check-deps',
		name: 'check-deps',
	},
	{
		command: ['bun', 'run', 'check:dead-code'],
		description: 'knip finds no unused files, exports, or dependencies',
		label: 'check:dead-code',
		name: 'check:dead-code',
	},
	{
		command: ['bun', 'run', 'self-contained'],
		description:
			'Every path a standalone checkout needs is present, with no sibling-tree references',
		label: 'self-contained',
		name: 'self-contained',
	},
	{
		command: ['bun', 'run', 'check:licenses'],
		description: 'Every package in the resolved closure has a recognized license and a notice',
		label: 'check:licenses',
		name: 'check:licenses',
	},
	{
		command: ['bun', 'run', 'prompt:snapshot:check'],
		description: 'The committed prompt snapshots match what the prompt sources compile to',
		label: 'prompt:snapshot:check',
		name: 'prompt:snapshot:check',
	},
	{
		command: ['bun', 'run', 'check:leak-guard'],
		description: 'The commit-time leak guard still blocks every secret shape it claims to',
		label: 'check:leak-guard',
		name: 'check:leak-guard',
	},
	// Beside check:leak-guard because both look outward: this one compares every shared file in the
	// fleet against the repository that owns it. It is registered uncacheable — its inputs are the
	// sibling checkouts, so hashing this repository answers "did the owner change" and never "did a
	// target drift", which is the only thing it asks.
	{
		command: ['bun', 'run', 'check:shared-core'],
		description:
			'Every shared file is byte-identical in the repositories the manifest sends it to',
		label: 'check:shared-core',
		name: 'check:shared-core',
	},
	{
		command: ['bun', 'run', 'format:check'],
		description: 'Prettier reports no formatting drift',
		label: 'format:check',
		name: 'format:check',
	},
	{
		command: ['bun', 'run', 'typecheck'],
		description: 'The root and frontend TypeScript projects compile with no errors',
		label: 'typecheck',
		name: 'typecheck',
	},
	{
		command: ['bun', 'run', 'lint'],
		description:
			'Every workspace passes ESLint, uncached so the type-aware rules are authoritative',
		label: 'lint',
		name: 'lint',
	},
	{
		command: ['bun', 'run', 'test:coverage'],
		description: 'The bun:test suite passes and coverage stays above its thresholds',
		label: 'bun test',
		name: 'test',
	},
	// build:shared/build:backend/build:cli are absent on purpose: those workspace "build"
	// scripts are `tsc -p` against noEmit configs whose options match the root tsconfig,
	// so the typecheck step already covers them exactly. build:frontend (vite) is the
	// only step that emits artifacts.
	{
		command: ['bun', 'run', 'build:frontend'],
		description: 'The Vite production build of the web surface succeeds',
		label: 'build:frontend',
		name: 'build:frontend',
	},
	// Both must follow build:frontend: they read its output. They are complementary, not
	// redundant — verify-minification caps TOTAL bytes, check:critical-path guards the SHAPE of
	// the first load. A regression that moves the React runtime out of a preloaded chunk costs a
	// round trip while leaving total bytes unchanged, so only the second can see it.
	{
		command: ['bun', 'run', 'verify-minification'],
		description: 'Frontend assets are minified and the bundle stays inside its byte budget',
		label: 'verify-minification',
		name: 'verify-minification',
	},
	{
		command: ['bun', 'run', 'check:critical-path'],
		description:
			'The first load keeps its preloaded-chunk shape, not only its byte total (WEB-001)',
		label: 'check:critical-path',
		name: 'check:critical-path',
	},
];

// Defined in ./lib/smoke-qc/fast-subset.ts, which carries the measurements behind the order.
export { FAST_QC_STEP_NAMES };

/**
 * Steps the fast gate runs differently from the full gate, keyed by the smoke:qc step they stand
 * in for. Only lint so far: the inner loop wants ESLint's --cache and the full gate must not have
 * it, because that cache keys on each file's own content and the type-aware rules do not. A type
 * change in one file can create a violation in another that the cache then treats as unchanged and
 * skips, so only the uncached run is authoritative.
 *
 * The replacement carries its own `name`, which is also the smoke-cache key. That is the point: a
 * fast pass records against `lint:fast` and can never leave a result that lets the full gate skip
 * `lint`. The name it replaces is still checked against SMOKE_QC_STEPS below, so the fast list
 * cannot drift out of the full list unnoticed.
 */
export const FAST_STEP_OVERRIDES: Record<string, SmokeQcStep> = {
	lint: {
		command: ['bun', 'run', 'lint:fast'],
		description: 'Every workspace passes ESLint, with the cache the inner loop wants',
		label: 'lint (cached)',
		name: 'lint:fast',
	},
};

export const FAST_QC_STEPS: SmokeQcStep[] = FAST_QC_STEP_NAMES.map((name) => {
	const step = SMOKE_QC_STEPS.find((candidate) => candidate.name === name);
	if (step === undefined) {
		throw new Error(`smoke-qc: fast step '${name}' is not a smoke:qc step`);
	}
	return FAST_STEP_OVERRIDES[name] ?? step;
});
