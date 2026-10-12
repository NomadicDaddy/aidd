import type { PromptPlan } from 'aidd-shared/plan/types';

import type { ProjectContextDigest } from '../../metadata/projectContext.ts';

import { loadAuditPromptDefinition } from './audit/definitions.ts';
import { renderAuditPromptBody } from './audit/template.ts';
import { stringVariable } from './shared.ts';

// One agent session audits exactly one thing: the prompt carries the single definition named by
// the `auditName` variable, however many audits the run was asked for.
export async function compileAuditPrompt(
	plan: PromptPlan,
	rootDir: string,
	priorContext?: ProjectContextDigest,
): Promise<string> {
	const auditName = stringVariable(plan, 'auditName') ?? 'AUDIT';
	const definition = await loadAuditPromptDefinition(rootDir, auditName);
	return renderAuditPromptBody({
		auditCategory: definition.category,
		auditGuidelines: definition.body,
		auditName,
		auditNameLower: definition.nameLower,
		...(priorContext ? { priorContext } : {}),
	});
}
