import type { PromptPlan } from 'aidd-shared/plan/types';

import type { ProjectContextDigest } from '../../metadata/projectContext.ts';

import {
	type AuditPromptDefinition,
	compileBatchAuditGuidelines,
	loadAuditPromptDefinition,
} from './audit/definitions.ts';
import { renderAuditPromptBody } from './audit/template.ts';
import { booleanVariable, stringArrayVariable, stringVariable } from './shared.ts';

export async function compileAuditPrompt(
	plan: PromptPlan,
	rootDir: string,
	priorContext?: ProjectContextDigest
): Promise<string> {
	const selectedAuditNames = stringArrayVariable(plan, 'auditNames');
	const auditName = stringVariable(plan, 'auditName') ?? selectedAuditNames[0] ?? 'AUDIT';
	const auditNames = selectedAuditNames.length > 0 ? selectedAuditNames : [auditName];
	const auditDefinitions = await Promise.all(
		auditNames.map((name) => loadAuditPromptDefinition(rootDir, name))
	);
	const primaryAudit: AuditPromptDefinition = auditDefinitions[0] ?? {
		body: '',
		category: 'Audit',
		name: auditName,
		nameLower: auditName.toLowerCase().replaceAll('_', '-'),
	};
	const auditBatchMode = booleanVariable(plan, 'auditBatchMode') && auditDefinitions.length > 1;
	const auditGuidelines = auditBatchMode
		? compileBatchAuditGuidelines(auditDefinitions)
		: primaryAudit.body;
	const auditCategory = primaryAudit.category;
	const auditNameLower = primaryAudit.nameLower;
	const parallelGuidance = auditBatchMode
		? `
### MULTI-AUDIT PARALLELIZATION

This run covers multiple independent audits: ${auditDefinitions
				.map((definition) => definition.name)
				.join(', ')}.

Use parallel subagents or delegated workers for the individual audits when your CLI/runtime supports them. Assign one selected audit to each subagent, have each subagent inspect the same codebase and produce verified findings for only that audit, then synthesize the final result yourself. If this backend does not support subagents, complete all selected audits in this single run.

Do not fix code. Do not omit any selected audit. The final \`AIDD_RESULT\` must contain one \`auditReports[]\` entry per selected audit.

---`
		: '';

	return renderAuditPromptBody({
		auditCategory,
		auditGuidelines,
		auditName,
		auditNameLower,
		parallelGuidance,
		...(priorContext ? { priorContext } : {}),
	});
}
