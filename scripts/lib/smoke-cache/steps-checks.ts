/**
 * Cache dependencies for the `check:*` guards: the qc steps that assert something about the
 * repository rather than compiling, formatting, or testing it.
 *
 * Split out of `dependencies.ts` to keep both files inside the 300-line modularity gate;
 * `dependencies.ts` merges this map into the single one the cache consumes.
 */

export const CHECK_STEP_DEPENDENCIES: Record<string, string[]> = {
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
	// `**/*.md` rather than the documentation directories by name: the gate walks the whole tree, so
	// a glob list naming today's doc roots would let the cache skip the run that would have seen a
	// broken link in a markdown file added somewhere else. It over-hashes in one direction only —
	// gitignored markdown the gate itself skips still counts as an input, which costs a cache miss
	// and never a missed finding.
	'check:docs': ['**/*.md', 'package.json', 'scripts/check-docs.ts', 'scripts/lib/docs/*.ts'],
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
	// the reason this entry is not a copy of check:env-spread's: the only live violation this rule
	// ever had in this repository was under skills/, outside the root list of the hand-rolled test
	// that used to enforce it.
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
	// Narrower than check:schema-parity's list on purpose: this gate reads the schema's source text
	// and nothing else, so migrations and the parity lib are not inputs. `backend/src/db/schema-pg/`
	// does not exist here and is not listed; a glob for it would hash to nothing either way.
	'check:no-inline-references': [
		'backend/src/db/schema/**/*.ts',
		'package.json',
		'scripts/check-no-inline-references.ts',
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
