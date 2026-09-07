import { createHash } from 'node:crypto';

import type { Feature } from '../metadata/features.ts';
import type { FindingLedgerEvent } from '../metadata/findings-ledger.ts';

import {
	arrayOfStrings,
	type AuditFindingInput,
	type NormalizedAuditFinding,
	normalizeText,
	stringValue,
} from './audit-shared.ts';

const feedbackLoopRequirement =
	'IMPORTANT: After resolving this finding, locate the feature.json file(s) in .aidd/features/ whose spec originally produced the code or pattern that caused this audit finding. Update those feature.json spec(s) to prevent this issue from being reintroduced during a feature-based rebuild.';

export function normalizeFinding(
	finding: AuditFindingInput,
	auditName: string,
	existing: Feature[],
	index: number,
	ledgerEvents: FindingLedgerEvent[] = [],
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
	const fingerprint = findingFingerprint(auditName, title, affectedFiles);
	const featureMatch = matchingFeature(existing, auditName, title, affectedFiles, fingerprint);
	const ledgerResolution = latestLedgerResolution(ledgerEvents, fingerprint);
	const disposition = findingDisposition(featureMatch, ledgerResolution);
	// An open record on disk is the prior finding the operator can see; the ledger only names one
	// when nothing open matches.
	const priorFeatureId =
		featureMatch && isOpenFinding(featureMatch)
			? featureMatch.id
			: (ledgerResolution?.featureId ?? featureMatch?.id);
	const now = new Date().toISOString();
	const spec = ensureFeedbackLoop(
		stringValue(finding.spec) ??
			`Remediate the audit finding: ${title}\n\nAffected files:\n${affectedFiles.map((file) => `- ${file}`).join('\n')}`,
	);

	return {
		...(priorFeatureId ? { priorFeatureId } : {}),
		disposition,
		feature: {
			affectedFiles,
			auditSeverity: severity,
			auditSource: auditName,
			category: stringValue(finding.category) ?? 'Audit',
			createdAt: now,
			dependencies: [],
			description: stringValue(finding.description) ?? title,
			fingerprint,
			id,
			...(disposition === 'recur' && priorFeatureId
				? { notes: [`Recurrence of prior finding ${priorFeatureId}.`] }
				: {}),
			passes: false,
			priority: priorityForSeverity(severity),
			spec,
			status: 'backlog',
			title,
			updatedAt: now,
		},
	};
}

/**
 * One path spelling per file so the fingerprint survives the agent's platform: a Windows
 * backend reports `src\a.ts`, a POSIX one `src/a.ts`, and either may prefix `./`.
 */
export function normalizeAffectedFilePath(path: string): string {
	let normalized = path.trim().replaceAll('\\', '/');
	while (normalized.startsWith('./')) normalized = normalized.slice(2);
	return normalized;
}

export function canonicalAffectedFiles(affectedFiles: readonly string[]): string[] {
	return [
		...new Set(affectedFiles.map(normalizeAffectedFilePath).filter((f) => f !== '')),
	].sort();
}

export function findingFingerprint(
	auditSource: string,
	title: string,
	affectedFiles: string[],
): string {
	const canonical = JSON.stringify({
		affectedFiles: canonicalAffectedFiles(affectedFiles),
		auditSource,
		title: normalizeText(title),
	});
	return `f1-${createHash('sha256').update(canonical).digest('hex')}`;
}

/** A finding record still awaiting remediation: neither passing nor marked completed. */
function isOpenFinding(feature: Feature): boolean {
	return feature.passes !== true && feature.status !== 'completed';
}

function matchingFeature(
	existing: Feature[],
	auditName: string,
	title: string,
	affectedFiles: string[],
	fingerprint: string,
): Feature | undefined {
	const fingerprintMatches = existing.filter((feature) => feature.fingerprint === fingerprint);
	const exactOpen = fingerprintMatches.find(isOpenFinding);
	if (exactOpen) return exactOpen;
	if (fingerprintMatches[0]) return fingerprintMatches[0];

	const legacyMatches = existing.filter((feature) => {
		if (feature.fingerprint !== undefined || feature.auditSource !== auditName) return false;
		const sameTitle = normalizeText(feature.title) === normalizeText(title);
		const existingFiles = arrayOfStrings(feature.affectedFiles);
		const sameFiles =
			affectedFiles.length > 0 &&
			existingFiles.length > 0 &&
			affectedFiles.some((file) => existingFiles.includes(file));
		return sameTitle || sameFiles;
	});
	return legacyMatches.find(isOpenFinding) ?? legacyMatches[0];
}

function latestLedgerResolution(
	events: FindingLedgerEvent[],
	fingerprint: string,
): FindingLedgerEvent | undefined {
	for (let index = events.length - 1; index >= 0; index--) {
		const event = events[index];
		if (event?.fingerprint !== fingerprint) continue;
		if (event.event === 'emitted' || event.event === 'recurred') return undefined;
		if (event.event === 'dismissed' || event.event === 'remediated') return event;
	}
	return undefined;
}

function findingDisposition(
	featureMatch: Feature | undefined,
	ledgerResolution: FindingLedgerEvent | undefined,
): NormalizedAuditFinding['disposition'] {
	// An open record on disk is the strongest evidence: whatever the ledger says happened
	// earlier, creating a second record for the same finding would only split its history.
	if (featureMatch && isOpenFinding(featureMatch)) return 'suppress-duplicate';
	if (ledgerResolution?.event === 'dismissed' && ledgerResolution.reason === 'false-positive') {
		return 'suppress-dismissed';
	}
	if (ledgerResolution?.event === 'dismissed' || ledgerResolution?.event === 'remediated') {
		return 'recur';
	}
	// A resolved record (passes true, or completed without the flag) means the finding came back.
	if (featureMatch) return 'recur';
	return 'emit';
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
