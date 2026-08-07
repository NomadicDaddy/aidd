import { CHECK_STEP_DEPENDENCIES } from './steps-checks.ts';

export const UNCACHEABLE_STEPS = new Set([
	'check-application',
	'check-deps',
	'check:artifact-parity',
	'check:audit-artifact-hygiene',
	'check:audit-profile-mapping',
	'check:feature-integration',
	'check:schema-parity',
	// Its inputs are up to fifty sibling checkouts. Hashing this repository's files answers "did the
	// owner change" and never "did a target drift", and a target drifting is the only thing it
	// checks, so a cached pass would replay over a fleet it did not look at.
	'check:shared-core',
	'check:web-db-integrity',
]);
export const TEST_STEP_NAME = 'test';

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
	'build:frontend': [...FRONTEND_BUILD_INPUTS],
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
		'scripts/lib/test-coverage/**/*.ts',
		'scripts/lib/third-party-licenses/**/*.ts',
		'scripts/lib/test-run-lock.ts',
		'scripts/lib/test-temp-root.ts',
		'scripts/run-test-coverage.ts',
		'scripts/run-tests.ts',
		'scripts/smoke-cache.ts',
		'scripts/smoke-qc.ts',
		'test/**/*.ts',
	],
	'test:gate-conventions': [
		// The gate and its rule library are the inputs; the fixture the test writes is created and
		// deleted inside the run, so it can never be a cache input.
		'package.json',
		'scripts/check-gate-conventions.ts',
		'scripts/lib/gate/**/*.ts',
		'scripts/test-gate-conventions.ts',
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
const GENERATED_OUTPUT_STEPS = new Set(['check:critical-path', 'verify-minification']);

export function isGeneratedOutputStep(step: string): boolean {
	return GENERATED_OUTPUT_STEPS.has(step);
}
