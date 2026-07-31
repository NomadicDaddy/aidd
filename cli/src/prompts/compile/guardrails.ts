import type { PromptPlan } from 'aidd-shared/plan/types';

import { readFragment } from './shared.ts';

const guardrailFragments = [
	'prompts/_common/hard-constraints.md',
	'prompts/_common/forbidden-commands.md',
	'prompts/_common/artifact-git-policy.md',
] as const;

// The shared hard-constraints blocked-state flow (document the question in
// /.aidd/CHANGELOG.md, park the feature as waiting_approval) is written for mutating
// feature work. Audit mode is read-only and has no selected feature, so following that
// flow would both violate the audit prompt's own write prohibition and reference a
// feature that does not exist. Rendered after the shared fragments so it wins.
const auditModeAdjustment = `### AUDIT MODE ADJUSTMENT (overrides the blocked-state flow above)

This is a read-only audit session with no selected feature. Where the constraints above say to document a blocker in \`/.aidd/CHANGELOG.md\` or set a feature to \`"status": "waiting_approval"\`, do neither — audit mode never writes \`/.aidd/\` files or git. If the audit is genuinely blocked, describe the blocker in your normal response and do not emit \`AIDD_RESULT\`; aidd records the failed audit and retries or surfaces it.`;

export async function applyGuardrails(
	plan: PromptPlan,
	rootDir: string,
	source: string,
): Promise<string> {
	const parts: string[] = [];
	for (const path of guardrailFragments) {
		const fragment = await readFragment(rootDir, path);
		if (fragment.trim()) parts.push(fragment.trim());
	}
	if (plan.mode === 'audit' && parts.length > 0) parts.push(auditModeAdjustment);
	if (parts.length === 0) return source;
	return `${parts.join('\n\n---\n\n')}\n\n---\n\n${source}`;
}
