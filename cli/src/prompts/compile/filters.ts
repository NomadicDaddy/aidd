import type { FeatureFilter, PromptPlan } from 'aidd-shared/plan/types';

import { compileMilestone } from './milestone.ts';

export function compileFilterBlock(filter: FeatureFilter): string {
	return `## FEATURE FILTER (applied via --filter-by ${filter.field} --filter ${filter.value})

**CRITICAL: You MUST only work on features where \`${filter.field}\` equals \`${filter.value}\`.**

When selecting features from \`/.aidd/features/*/feature.json\`:
- Read each feature.json and check its \`${filter.field}\` field
- **SKIP** any feature where \`${filter.field}\` is NOT \`${filter.value}\`
- Only consider features matching this filter for implementation, validation, and status reporting
- This filter applies to ALL feature selection throughout this session

---

`;
}

export function compileFeatureFocus(value: string, directory: string): string {
	return `## FEATURE FOCUS (applied via --feature ${value})

**CRITICAL: You MUST focus exclusively on the feature in directory \`${directory}\`.**

When working with features from \`/.aidd/features/*/feature.json\`:
- **ONLY** work on the feature in \`/.aidd/features/${directory}/feature.json\`
- **SKIP** all other features entirely
- This feature focus applies to ALL feature selection throughout this session

---

`;
}

export function applyFilters(plan: PromptPlan, source: string): string {
	const parts: string[] = [];
	if (plan.milestone)
		parts.push(compileMilestone(plan.milestone.value, plan.milestone.featureDirectories));
	if (plan.featureFocus)
		parts.push(compileFeatureFocus(plan.featureFocus.value, plan.featureFocus.directory));
	for (const filter of plan.filters) parts.push(compileFilterBlock(filter));
	return `${parts.join('')}${source}`;
}
