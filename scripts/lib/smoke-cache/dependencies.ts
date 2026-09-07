import { CHECK_STEP_DEPENDENCIES } from './steps-checks.ts';

export const UNCACHEABLE_STEPS = new Set([
	'check-application',
	'check:audit-artifact-hygiene',
	// Its corpus is the gitignored artifact directories, which grow with every run and are
	// invisible to a repository-file hash. A cached pass would replay over artifacts it never saw,
	// and those artifacts are the entire population.
	'check:credential-disclosure',
	// Its inputs are up to fifty sibling checkouts. Hashing this repository's files answers "did the
	// owner change" and never "did a target drift", and a target drifting is the only thing it
	// checks, so a cached pass would replay over a fleet it did not look at.
	'check:shared-core',
	// Inspects the current local database, including rows written since the last source change.
	'check:web-db-integrity',
]);
export const TEST_STEP_NAME = 'test';
export const SMOKE_CACHE_RELATIVE_PATH = 'scripts/smoke-cache.json';

export const CI_WORKFLOW_TEST_INPUT = '.github/workflows/ci.yml';

export const RUN_HISTORY_COPY_TEST_INPUTS = [
	'frontend/src/pages/runs/RunsPage.tsx',
	'frontend/src/pages/projects/ProjectDetailPage.tsx',
	'frontend/src/pages/projects/ProjectsPage.tsx',
	'frontend/src/pages/projects/detail/RunsTab.tsx',
	'frontend/src/components/shared/LocalAiddHistoryPanel.tsx',
	'frontend/src/api/types.ts',
	'backend/src/services/projectMetadata.ts',
	'backend/src/services/runService.ts',
	'.aidd/assertions.md',
	'.aidd/screen-map.md',
	'.aidd/testing-scenarios.md',
] as const;

export const TEST_RUNTIME_INPUTS = [CI_WORKFLOW_TEST_INPUT, ...RUN_HISTORY_COPY_TEST_INPUTS];

// `shared/` is a build input, not just a typecheck input: the frontend imports aidd-shared directly
// (the console parsers under shared/src/backends/parsers are compiled into the bundle). Omitting it
// let an edit to a shared parser leave build:frontend cached, so smoke:qc passed while frontend/dist
// still served the pre-edit rendering — a green gate over a stale artifact.
const FRONTEND_BUILD_INPUTS = [
	'bun.lock',
	'frontend/index.html',
	'frontend/package.json',
	'frontend/src/**/*',
	'frontend/tsconfig.json',
	'frontend/vite.config.ts',
	'package.json',
	'shared/package.json',
	'shared/src/**/*.ts',
	'shared/tsconfig.json',
];

const LINT_DEPENDENCIES = [
	'backend/package.json',
	'backend/src/**/*.ts',
	'bun.lock',
	'cli/package.json',
	'cli/src/**/*.ts',
	'eslint.config.js',
	'frontend/eslint.config.js',
	'frontend/package.json',
	'frontend/src/**/*',
	'frontend/vite.config.ts',
	'package.json',
	'scripts/**/*.ts',
	'shared/package.json',
	'shared/src/**/*.ts',
	'test/**/*.js',
	'test/**/*.jsx',
	'test/**/*.ts',
	'test/**/*.tsx',
];

export const STEP_DEPENDENCIES: Record<string, string[]> = {
	// The analysis build reruns the production build under an overlay, so it shares the build's
	// inputs, plus the gate that reads what it wrote. Its artifact lives under data/, which
	// collect.ts excludes from hashing, so the existence check in outputs.ts is what covers a
	// deleted report.
	'build:analyze': [...FRONTEND_BUILD_INPUTS, 'scripts/check-bundle-analysis.ts'],
	'build:frontend': [...FRONTEND_BUILD_INPUTS],
	'check-deps': [
		// The workflows are inputs, not bystanders: checkBunPinDrift reads the bun-version in each
		// and raises an error finding when it drifts from the root packageManager pin. Omitting them
		// lets a drifted pin sit behind a cached pass.
		'.github/workflows/**/*.yaml',
		'.github/workflows/**/*.yml',
		'backend/package.json',
		'bun.lock',
		'cli/package.json',
		'frontend/package.json',
		'package.json',
		'scripts/check-deps.ts',
		'scripts/lib/check-deps/**/*.ts',
		'shared/package.json',
	],
	...CHECK_STEP_DEPENDENCIES,
	'format:check': ['.prettierignore', '.prettierrc', 'package.json', 'bun.lock'],
	lint: LINT_DEPENDENCIES,
	// The fast gate's ESLint-cached stand-in for lint (see FAST_STEP_OVERRIDES). Same dependency
	// set, deliberately its own cache entry so a fast pass never satisfies the uncached full gate.
	'lint:fast': LINT_DEPENDENCIES,
	// The compiled snapshots are an input as well as the thing being checked: editing a snapshot by
	// hand is itself the drift this gate exists to catch.
	'prompt:snapshot:check': [
		'cli/src/**/*.ts',
		'cli/src/prompts/snapshots/**/*.md',
		'prompts/**/*.md',
		'shared/src/**/*.ts',
		'package.json',
	],
	'self-contained': [
		'backend/package.json',
		'backend/src/**/*.ts',
		'cli/package.json',
		'cli/src/**/*.ts',
		'package.json',
		'scaffolding/**/*',
		'shared/package.json',
		'shared/src/**/*.ts',
		'scripts/self-contained.ts',
	],
	test: [
		'bun.lock',
		'bunfig.toml',
		'package.json',
		'scripts/lib/smoke-cache/**/*.ts',
		// Tests import the gate's own step registry, cache-coverage guard, and build-diagnostics
		// capture directly, so an edit to any of them must miss the test cache the same way an
		// edit to scripts/smoke-qc.ts does.
		'scripts/lib/smoke-qc/**/*.ts',
		'scripts/lib/test-coverage/**/*.ts',
		'scripts/lib/third-party-licenses/**/*.ts',
		// The phase split and the stall watchdog live here, and between them they decide which
		// files run, in which phase, and when a wedged phase is killed and retried. Each changes
		// what a test run does without any edit to run-tests.ts, so keying on that file alone
		// would serve a cached pass for a suite that never ran the way the cache recorded.
		'scripts/lib/test-run/**/*.ts',
		'scripts/lib/test-run-lock.ts',
		'scripts/lib/test-temp-root.ts',
		'scripts/run-test-coverage.ts',
		'scripts/run-tests.ts',
		'scripts/smoke-cache.ts',
		'scripts/smoke-qc.ts',
		'test/**/*.ts',
	],
	'test:api-types': [
		'package.json',
		'scripts/check-api-types.ts',
		'scripts/lib/api-types/**/*.ts',
		'scripts/test-api-types.ts',
	],
	'test:audit-evals': [
		'audits/HYGIENE.md',
		'audits/SECURITY.md',
		'evals/audits/fixtures/**/*',
		'evals/audits/floors.json',
		'evals/audits/manifest.json',
		'package.json',
		'scripts/check-audit-evals.ts',
		'scripts/lib/audit-eval/**/*.ts',
		'scripts/lib/benchmark/**/*.ts',
		'scripts/test-audit-evals.ts',
	],
	'test:gate-conventions': [
		// The gate and its rule library are the inputs; the fixture the test writes is created and
		// deleted inside the run, so it can never be a cache input.
		'package.json',
		'scripts/check-gate-conventions.ts',
		'scripts/lib/gate/**/*.ts',
		'scripts/test-gate-conventions.ts',
	],
	'test:media-provenance': [
		'package.json',
		'scripts/check-media-provenance.ts',
		'scripts/lib/media-provenance/**/*.ts',
		'scripts/test-media-provenance.ts',
	],
	typecheck: [
		'backend/package.json',
		'backend/src/**/*.ts',
		'backend/tsconfig.json',
		'cli/package.json',
		'cli/src/**/*.ts',
		'cli/tsconfig.json',
		'package.json',
		'bun.lock',
		'frontend/package.json',
		'shared/package.json',
		'shared/src/**/*.ts',
		'shared/tsconfig.json',
		'tsconfig.json',
		'frontend/tsconfig.json',
		'frontend/src/**/*',
		'test/**/*.ts',
		'scripts/**/*.ts',
	],
	// Same artifact-hashing rationale as check:critical-path; see GENERATED_OUTPUT_STEPS.
	'verify-minification': [
		'frontend/dist/**/*',
		'scripts/bundle-budget.json',
		'scripts/verify-minification.ts',
	],
};

export function isCacheableStep(step: string): boolean {
	return step in STEP_DEPENDENCIES && !UNCACHEABLE_STEPS.has(step);
}

export function isKnownSmokeCacheStep(step: string): boolean {
	return step in STEP_DEPENDENCIES || UNCACHEABLE_STEPS.has(step);
}

/** The build output directory, excluded from hashing except for the steps that consume it. */
export const GENERATED_OUTPUT_PREFIX = 'frontend/dist';

/**
 * Steps that READ frontend/dist rather than produce it. They must hash the artifact itself: keying
 * them on the sources that produced it only proves the build COULD be current, so a stale, partial,
 * or hand-edited dist would sit behind a valid cache entry and never be re-inspected.
 */
const GENERATED_OUTPUT_STEPS = new Set([
	'check:critical-path',
	'check:media-provenance',
	'verify-minification',
]);

export function isGeneratedOutputStep(step: string): boolean {
	return GENERATED_OUTPUT_STEPS.has(step);
}
