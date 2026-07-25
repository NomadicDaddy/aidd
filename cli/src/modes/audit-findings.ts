import type { Feature } from 'aidd-shared/metadata/features';

import {
	arrayOfStrings,
	type AuditFindingInput,
	type NormalizedAuditFinding,
	normalizeText,
	stringValue,
} from 'aidd-shared/modes/audit-shared';

const feedbackLoopRequirement =
	'IMPORTANT: After resolving this finding, locate the feature.json file(s) in .aidd/features/ whose spec originally produced the code or pattern that caused this audit finding. Update those feature.json spec(s) to prevent this issue from being reintroduced during a feature-based rebuild.';

export function normalizeFinding(
	finding: AuditFindingInput,
	auditName: string,
	existing: Feature[],
	index: number,
): NormalizedAuditFinding {
	const title = stringValue(finding.title) ?? `Audit finding ${index + 1}`;
	const severity = normalizeSeverity(
		stringValue(finding.auditSeverity) ?? stringValue(finding.severity),
	);
	const auditSlug = auditName.toLowerCase().replaceAll('_', '-');
	const id =
		stringValue(finding.id) ??
		`audit-${auditSlug}-${Math.floor(Date.now() / 1000)}-${slugify(title) || `finding-${index + 1}`}`;
	const affectedFiles = arrayOfStrings(finding.affectedFiles);
	const duplicate = existing.some((feature) => {
		const sameSource = feature.auditSource === auditName;
		const sameTitle = normalizeText(feature.title) === normalizeText(title);
		const existingFiles = arrayOfStrings(feature.affectedFiles);
		const sameFiles =
			affectedFiles.length > 0 &&
			existingFiles.length > 0 &&
			affectedFiles.some((file) => existingFiles.includes(file));
		return sameSource && (sameTitle || sameFiles) && feature.passes !== true;
	});
	const now = new Date().toISOString();
	const spec = ensureFeedbackLoop(
		stringValue(finding.spec) ??
			`Remediate the verified audit finding: ${title}\n\nAffected files:\n${affectedFiles.map((file) => `- ${file}`).join('\n')}`,
	);

	return {
		duplicate,
		feature: {
			affectedFiles,
			auditSeverity: severity,
			auditSource: auditName,
			category: stringValue(finding.category) ?? 'Audit',
			createdAt: now,
			dependencies: [],
			description: stringValue(finding.description) ?? title,
			id,
			passes: false,
			priority: priorityForSeverity(severity),
			spec,
			status: 'backlog',
			title,
			updatedAt: now,
		},
	};
}

function ensureFeedbackLoop(spec: string): string {
	return spec.includes(feedbackLoopRequirement)
		? spec
		: `${spec.trim()}\n\n${feedbackLoopRequirement}`;
}

function normalizeSeverity(value: string | undefined): string {
	const lower = value?.toLowerCase();
	if (lower === 'critical') return 'Critical';
	if (lower === 'high') return 'High';
	if (lower === 'medium') return 'Medium';
	if (lower === 'low') return 'Low';
	return 'Medium';
}

function priorityForSeverity(severity: string): number {
	if (severity === 'Critical') return 1;
	if (severity === 'High') return 2;
	if (severity === 'Medium') return 3;
	return 4;
}

function slugify(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 80);
}

// Two findings in one run can derive the same feature id (same audit type +
// second-boundary timestamp + title that slugifies identically). Writing both
// by that id would silently overwrite the first. Append a deterministic numeric
// suffix so every distinct finding persists.
export function disambiguateFeatureId(desiredId: string, taken: Set<string>): string {
	if (!taken.has(desiredId)) return desiredId;
	let suffix = 2;
	while (taken.has(`${desiredId}-${suffix}`)) suffix += 1;
	return `${desiredId}-${suffix}`;
}
