export const UNCACHEABLE_STEPS = new Set([
	'check-application',
	'check-deps',
	'check:artifact-parity',
	'check:audit-artifact-hygiene',
	'check:audit-profile-mapping',
	'check:feature-integration',
	'check:schema-parity',
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
	'check:backend-cli-boundary': [
		'backend/src/**/*.ts',
		'package.json',
		'scripts/check-backend-cli-boundary.ts',
	],
	// Hashes the artifact it inspects, not just the sources that produced it — see
	// GENERATED_OUTPUT_STEPS. The declared output in outputs.ts covers the empty-dist case,
	// which hashing alone cannot: no files means nothing to hash, not a changed hash.
	'check:critical-path': [
		'frontend/dist/**/*',
		'scripts/check-critical-path.ts',
		'scripts/critical-path-budget.json',
	],
	'check:dead-code': [
		'backend/package.json',
		'backend/src/**/*.ts',
		'backend/tsconfig.json',
		'bun.lock',
		'cli/package.json',
		'cli/src/**/*.ts',
		'cli/tsconfig.json',
		'frontend/package.json',
		'frontend/src/**/*',
		'frontend/tsconfig.json',
		'knip.jsonc',
		'package.json',
		'scripts/**/*.ts',
		'shared/package.json',
		'shared/src/**/*.ts',
		'shared/tsconfig.json',
		'test/**/*.ts',
		'tsconfig.json',
	],
	'check:env-spread': [
		'backend/src/**/*.ts',
		'cli/src/**/*.ts',
		'package.json',
		'shared/src/**/*.ts',
		'scripts/**/*.ts',
		'scripts/check-env-spread.ts',
	],
	'check:fresh-release': [
		'.github/**/*',
		'CONTEXT.md',
		'README.md',
		'VERSION',
		'audits/**/*',
		'docs/**/*',
		'licenses/releases/**/*',
		'package.json',
		'scripts/check-fresh-release.ts',
		'scripts/lib/fresh-release/**/*.ts',
		'scripts/**/*',
		'test/scripts/**/*',
	],
	'check:leak-guard': [
		'.githooks/leak-guard.sh',
		'package.json',
		'scripts/check-leak-guard.sh',
		'scripts/run-bash.ts',
	],
	'check:licenses': [
		'THIRD-PARTY-LICENSES.md',
		'THIRD-PARTY-NOTICES.md',
		'CODE_OF_CONDUCT.md',
		'CONTRIBUTING.md',
		'LICENSE',
		'PRIVACY.md',
		'README.md',
		'SECURITY.md',
		'SUPPORT.md',
		'VERSION',
		'audits/**/*',
		'backend/package.json',
		'bun.lock',
		'cli/package.json',
		'config.json.example',
		'docs/**/*',
		'frontend/public/**/*',
		'frontend/package.json',
		'licenses/**/*',
		'package.json',
		'prompts/**/*',
		'recipes/**/*',
		'scaffolding/**/*',
		'scripts/check-license-core.ts',
		'scripts/generate-third-party-licenses.ts',
		'scripts/lib/license-core/**/*.ts',
		'scripts/lib/third-party-licenses/**/*.ts',
		'shared/package.json',
		'site/**/*',
		'skills/**/*',
	],
	'check:max-lines': [
		'cli/src/**/*.ts',
		'cli/src/**/*.tsx',
		'backend/src/**/*.ts',
		'frontend/src/**/*',
		'shared/src/**/*.ts',
		'scripts/**/*.ts',
		'scripts/check-max-lines.ts',
		'package.json',
	],
	'check:schema-parity': [
		'backend/src/db/**/*.ts',
		'backend/src/db/migrations/**/*.sql',
		'package.json',
		'scripts/check-schema-parity.ts',
		'scripts/lib/web-schema-parity/**/*.ts',
	],
	'check:web-db-integrity': [
		'backend/src/db/**/*.ts',
		'backend/src/db/migrations/**/*.sql',
		'package.json',
		'scripts/check-web-db-integrity.ts',
	],
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
