import type {
	AuditReportGroup,
	AuditReportSummary,
	ContextFilePresence,
	ProjectContextDigest,
	SessionReportSummary,
} from '../../metadata/projectContext.ts';

export function renderAuditPriorContext(context: ProjectContextDigest): string {
	const parts: string[] = ['### PRIOR CONTEXT (auto-loaded by aidd)'];

	parts.push('', renderAuditReportSection(context.auditReports));
	parts.push('', renderChangelogSection(context));
	parts.push('', renderSessionReportSection(context));
	parts.push('', renderContextFileSection(context.contextFile));
	parts.push(
		'',
		'Use this prior context to anchor severity claims, dedupe against issues already on the backlog, and flag regressions. Do not assume current code matches prior reports — verify against the live codebase before forming findings.'
	);

	return parts.join('\n');
}

export function renderCodingPriorContext(context: ProjectContextDigest): string {
	const parts: string[] = ['## PRIOR CONTEXT (auto-loaded by aidd)'];

	parts.push('', renderChangelogSection(context));
	parts.push('', renderSessionReportSection(context));
	parts.push('', renderContextFileSection(context.contextFile));
	parts.push(
		'',
		'Skim this prior context before starting work. Use it to avoid reverting recent changes, duplicating remediation already in flight, or repeating questions answered in a recent session.'
	);

	return parts.join('\n');
}

function renderAuditReportSection(groups: AuditReportGroup[]): string {
	if (groups.length === 0) {
		return '#### Prior audit reports\n\n_No prior reports found for the selected audit(s)._';
	}
	return groups.map(renderAuditReportGroup).join('\n\n');
}

function renderAuditReportGroup(group: AuditReportGroup): string {
	const heading = `#### Prior \`${group.auditName}\` audit reports`;
	const items = group.recent.map(renderAuditReportItem).join('\n\n');
	return `${heading}\n\n${items}`;
}

function renderAuditReportItem(report: AuditReportSummary): string {
	const dateSuffix = report.date ? ` (${report.date})` : '';
	const heading = `- \`${report.path}\`${dateSuffix}`;
	if (!report.excerpt) return heading;
	const indented = report.excerpt
		.split('\n')
		.map((line) => (line.length > 0 ? `  ${line}` : ''))
		.join('\n');
	return `${heading}\n\n${indented}`;
}

function renderChangelogSection(context: ProjectContextDigest): string {
	const heading = '#### Recent project changelog';
	if (!context.changelog.sourceExists) {
		return `${heading}\n\n_No \`.aidd/CHANGELOG.md\` present._`;
	}
	const trimmed = context.changelog.recentLines.trim();
	if (trimmed.length === 0) {
		return `${heading}\n\n_CHANGELOG is empty._`;
	}
	const note = context.changelog.truncated ? '\n\n_(truncated to the most recent slice)_' : '';
	return `${heading}\n\n\`\`\`markdown\n${trimmed}\n\`\`\`${note}`;
}

function renderSessionReportSection(context: ProjectContextDigest): string {
	const heading = '#### Recent session reports';
	if (context.sessionReports.recent.length === 0) {
		return `${heading}\n\n_No recent session reports._`;
	}
	const items = context.sessionReports.recent.map(renderSessionReportItem).join('\n');
	return `${heading}\n\n${items}`;
}

function renderSessionReportItem(report: SessionReportSummary): string {
	const dateSuffix = report.date ? ` (${report.date})` : '';
	const title = report.title ? ` — ${report.title}` : '';
	return `- \`${report.path}\`${dateSuffix}${title}`;
}

function renderContextFileSection(contextFile: ContextFilePresence): string {
	const heading = '#### Domain context file';
	if (!contextFile.exists) {
		return `${heading}\n\n_No \`${contextFile.relativePath}\` at project root._`;
	}
	return `${heading}\n\n- \`${contextFile.relativePath}\` is present at the project root. Read it before forming findings or implementing changes — it defines the project's shared vocabulary, key entities, and relationships. Findings or code that contradict this glossary should be reconsidered.`;
}
