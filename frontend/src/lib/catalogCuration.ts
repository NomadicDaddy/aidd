import type { SkillCategory } from '../api/types.ts';

export type SkillCategoryFilter = 'all' | SkillCategory;

/** Category filter options rendered by the Skills page, in display order. */
export const SKILL_CATEGORY_FILTERS: readonly { label: string; value: SkillCategoryFilter }[] = [
	{ label: 'All', value: 'all' },
	{ label: 'General', value: 'general' },
	{ label: 'Runtime', value: 'runtime' },
	{ label: 'Metadata', value: 'metadata' },
	{ label: 'Audit / Remediation', value: 'audit-remediation' },
	{ label: 'Recipe / Maturity', value: 'recipe-maturity' },
	{ label: 'Spernakit Fleet', value: 'spernakit-fleet' },
];

const skillCategoryFilterValues = new Set<string>(SKILL_CATEGORY_FILTERS.map((o) => o.value));

/**
 * Reads the Skills category filter from the `category` query parameter. Anything that is not one
 * of the rendered filter values — including `null` (absent) — reads as `all`, so a stale or
 * hand-edited link cannot select a category the SegmentedControl cannot display.
 */
export function readSkillCategoryFilter(value: null | string): SkillCategoryFilter {
	return value !== null && skillCategoryFilterValues.has(value)
		? (value as SkillCategoryFilter)
		: 'all';
}

/**
 * Skill ids referenced by `recipes/*.json` steps (`stepType: "skill"`).
 * Source of truth lives in the recipe files; the CLI catalog test
 * (`test/cli/skill-catalog.test.ts`) verifies those references resolve, and
 * this set must stay aligned so the Recipe badge mirrors actual usage.
 */
export const RECIPE_SKILL_IDS: ReadonlySet<string> = new Set([
	'audit-finding-review',
	'audit-review',
	'bug2feature',
	'changelog-rewrite',
	'codebase-analysis',
	'coderabbit',
	'consolidate-features',
	'deepreview',
	'devdiary-update',
	'doc2feature',
	'document-changes',
	'feature-coverage-audit',
	'feature-review',
	'humanize-docs',
	'onboarding-interview',
	'refresh-project-artifacts',
	'review-doc',
	'ship-pr',
	'spernakit-apply-ui',
	'spernakit-bump',
	'spernakit-dance',
	'spernakit-justify-diffs',
	'spernakit-template-refactor',
	'spernakit-template-upgrade',
	'spernakit-tester',
	'spernakit-update-docs',
	'spirit',
	'tester',
	'testing-scenarios',
	'ui-parity',
	'ui-redesign-planner',
	'update-audits',
	'update-roadmap',
	'validate-build',
	'validate-tests',
]);

/**
 * Skill ids referenced by maturity invocations (`MATURITY_INVOCATIONS`
 * where `kind === 'skill'`). Mirrors `shared/src/metadata/maturity.ts`.
 */
export const MATURITY_SKILL_IDS: ReadonlySet<string> = new Set([
	'deployment-readiness',
	'document-changes',
	'onboarding-interview',
	'review-or-create-doc',
	'testing-scenarios',
	'update-roadmap',
	'update-screen-map',
]);
