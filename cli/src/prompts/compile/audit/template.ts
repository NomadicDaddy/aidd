import type { ProjectContextDigest } from '../../../metadata/projectContext.ts';

import { renderAuditClosingSection } from './closing-section.ts';
import { renderAuditFindingsSection } from './findings-section.ts';
import { renderAuditIntroSection } from './intro-section.ts';

export interface AuditPromptBodyVariables {
	auditCategory: string;
	auditGuidelines: string;
	auditName: string;
	auditNameLower: string;
	priorContext?: ProjectContextDigest;
}

export function renderAuditPromptBody(variables: AuditPromptBodyVariables): string {
	const { auditCategory, auditGuidelines, auditName, auditNameLower, priorContext } = variables;

	return [
		renderAuditIntroSection(priorContext),
		renderAuditFindingsSection({ auditCategory, auditName, auditNameLower }),
		renderAuditClosingSection(auditGuidelines),
	].join('\n\n');
}
