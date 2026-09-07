/**
 * Cache dependencies for the `check:*` guards: the qc steps that assert something about the
 * repository rather than compiling, formatting, or testing it.
 *
 * Split out of `dependencies.ts` to keep both files inside the 300-line modularity gate;
 * `dependencies.ts` merges this map into the single one the cache consumes.
 */

export const CHECK_STEP_DEPENDENCIES: Record<string, string[]> = {
	'check:api-types': [
		'backend/src/**/*.ts',
		'bun.lock',
		'frontend/src/api/**/*.ts',
		'package.json',
		'scripts/api-type-inventory.json',
		'scripts/check-api-types.ts',
		'scripts/lib/api-types/**/*.ts',
		'shared/src/**/*.ts',
		'tsconfig.json',
	],
	'check:artifact-parity': [
		'docs/reference/artifacts.md',
		'package.json',
		'scaffolding/.gitignore',
		'scripts/check-artifact-parity.ts',
	],
	'check:audit-evals': [
		'audits/**/*',
		'evals/audits/attestation.json',
		'evals/audits/fixtures/**/*',
		'evals/audits/floors.json',
		'evals/audits/manifest.json',
		'package.json',
		'scripts/check-audit-evals.ts',
		'scripts/lib/audit-eval/**/*.ts',
		'scripts/lib/benchmark/evaluation.ts',
		'scripts/lib/benchmark/manifest.ts',
		'scripts/lib/benchmark/types.ts',
	],
	'check:audit-profile-mapping': [
		'audits/**/*',
		'package.json',
		'scripts/aidd-tools.ts',
		'scripts/lib/aidd-tools/**/*.ts',
		'shared/src/**/*.ts',
	],
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
		'scripts/lib/critical-path/**/*.ts',
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
	'check:destructive-confirmation': [
		'frontend/src/**/*.tsx',
		'package.json',
		'scripts/check-destructive-confirmation.ts',
		'scripts/lib/destructive/*.ts',
	],
	// `**/*.md` rather than the documentation directories by name: the gate walks the whole tree, so
	// a glob list naming today's doc roots would let the cache skip the run that would have seen a
	// broken link in a markdown file added somewhere else. It over-hashes in one direction only —
	// gitignored markdown the gate itself skips still counts as an input, which costs a cache miss
	// and never a missed finding.
	'check:docs': ['**/*.md', 'package.json', 'scripts/check-docs.ts', 'scripts/lib/docs/*.ts'],
	'check:env-spread': [
		'backend/src/**/*.{ts,tsx,js,mjs,cjs}',
		'cli/src/**/*.{ts,tsx,js,mjs,cjs}',
		'package.json',
		'shared/src/**/*.{ts,tsx,js,mjs,cjs}',
		'scripts/**/*.{ts,tsx,js,mjs,cjs}',
		'scripts/check-env-spread.ts',
	],
	'check:feature-integration': [
		'backend/src/routes/**/*.ts',
		'backend/src/server.ts',
		'frontend/src/App.tsx',
		'frontend/src/pages/**/*Page.tsx',
		'package.json',
		'scripts/check-feature-integration.ts',
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
	'check:gate-conventions': [
		// Every gate's own source is an input, because the gate reads all of them. `scripts/*.ts` is
		// deliberately the whole directory rather than the current gate list: a task added to
		// package.json changes the population, and a glob list naming today's gates would let the
		// cache skip the run that would have seen the new one.
		'package.json',
		'scripts/*.ts',
		'scripts/gate-conventions-allowlist.json',
		'scripts/lib/gate/**/*.ts',
	],
	// The gate scans seven roots; every one of them that exists here is listed. `skills/**/*.ts` is
	// the reason this entry is not a copy of check:env-spread's: a real violation of this rule can
	// live under skills/, outside every other scanned root.
	'check:git-window-hide': [
		'backend/src/**/*',
		'cli/src/**/*',
		'frontend/src/**/*',
		'package.json',
		'scripts/**/*',
		'shared/src/**/*',
		'skills/**/*',
		'test/**/*',
	],
	// Both halves it compares, plus the contract modules that decide which files it demands. The hook
	// directories are globbed rather than listed: a file present on one side and not the other is
	// itself the drift, so a list of today's filenames would cache away the run that would see it.
	'check:hook-parity': [
		'.githooks/**/*',
		'package.json',
		'scaffolding/.githooks/**/*',
		'scripts/check-hook-parity.ts',
		'scripts/lib/leak-guard/contract.ts',
		'scripts/lib/push-guards/contract.ts',
		'shared/src/metadata/history-guard.ts',
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
		'skills/**/*',
	],
	'check:max-lines': [
		'cli/src/**/*.ts',
		'cli/src/**/*.tsx',
		'backend/src/**/*.{ts,tsx}',
		'frontend/src/**/*',
		'shared/src/**/*.{ts,tsx}',
		'scripts/**/*.{ts,tsx}',
		'scripts/check-max-lines.ts',
		'package.json',
	],
	'check:media-provenance': [
		'dist/**/*.{jpeg,jpg,png,webp}',
		'docs/assets/**/*.{jpeg,jpg,png,webp}',
		'frontend/dist/**/*.{jpeg,jpg,png,webp}',
		'frontend/public/**/*.{jpeg,jpg,png,webp}',
		'package.json',
		'scripts/check-media-provenance.ts',
		'scripts/lib/media-provenance/**/*.ts',
	],
	// Narrower than check:schema-parity's list on purpose: this gate reads the schema's source text
	// and nothing else, so migrations and the parity lib are not inputs. `backend/src/db/schema-pg/`
	// does not exist here and is not listed; a glob for it would hash to nothing either way.
	'check:no-inline-references': [
		'backend/src/db/schema/**/*.ts',
		'package.json',
		'scripts/check-no-inline-references.ts',
	],
	'check:scaffold': [
		'.editorconfig',
		'.gitattributes',
		'.prettierignore',
		'.prettierrc',
		'bun.lock',
		'frontend/eslint.config.js',
		'package.json',
		'scaffolding/.aidd/**/*',
		'scaffolding/.editorconfig',
		'scaffolding/.gitattributes',
		'scaffolding/.gitignore',
		'scaffolding/.prettierignore',
		'scaffolding/.prettierrc',
		'scaffolding/**/*',
		'scripts/check-scaffold.ts',
		'scripts/require-bun.ts',
	],
	'check:schema-parity': [
		'backend/src/db/**/*.ts',
		'backend/src/db/migrations/**/*.sql',
		'package.json',
		'scripts/check-schema-parity.ts',
		'scripts/lib/web-schema-parity/**/*.ts',
	],
	// Existence is the input here, not content: a glob set that loses a path rehashes, which is what
	// makes a deleted or renamed script invalidate the step.
	'check:script-targets': [
		'*/package.json',
		'package.json',
		'scripts/**/*.sh',
		'scripts/**/*.ts',
	],
	// The registry is the input on both sides: it is what the runbook is generated from and what the
	// gate compares the runbook against, so a step added there must re-run this.
	'check:smoke-docs': [
		'package.json',
		'scripts/lib/smoke-qc/**/*.ts',
		'scripts/smoke-qc.md',
		'scripts/sync-smoke-docs.ts',
	],
	'check:web-db-integrity': [
		'backend/src/db/**/*.ts',
		'backend/src/db/migrations/**/*.sql',
		'package.json',
		'scripts/check-web-db-integrity.ts',
	],
};
