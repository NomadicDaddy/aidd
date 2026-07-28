import { classifyDependencyCycles, findDanglingDependencies, indexFeaturesByRef } from './graph.ts';
import { isAuditFinding, isRemediationFeature } from './query.ts';
import {
	type Feature,
	FEATURE_ID_PATTERN,
	type FeatureCollectionValidationResult,
	type FeatureValidationIssue,
} from './types.ts';

// The full canonical status vocabulary. 'completed' is the only completion status —
// strays like 'done' or 'verified' are invalid data, never aliases.
export const FEATURE_STATUSES = [
	'backlog',
	'in_progress',
	'completed',
	'waiting_approval',
] as const;

export type FeatureStatus = (typeof FEATURE_STATUSES)[number];

export function isValidFeatureStatus(status: string): status is FeatureStatus {
	return (FEATURE_STATUSES as readonly string[]).includes(status);
}

function requiresCompletionResolutionNote(feature: Feature): boolean {
	return feature.status === 'completed' && feature.passes === true
		? isAuditFinding(feature) || isRemediationFeature(feature)
		: false;
}

function hasResolutionNote(notes: unknown): boolean {
	if (typeof notes === 'string') return notes.trim().length > 0;
	if (Array.isArray(notes)) {
		return notes.some((note) => typeof note === 'string' && note.trim().length > 0);
	}
	return false;
}

export function validateFeatureContract(feature: Feature): FeatureValidationIssue[] {
	const issues: FeatureValidationIssue[] = [];
	const id = feature.directory ?? feature.id ?? 'unknown';
	if (!feature.id) {
		issues.push({ id, message: 'Missing required field: id' });
	} else if (!FEATURE_ID_PATTERN.test(feature.id)) {
		issues.push({
			id,
			message: `Invalid 'id' format: '${feature.id}' (expected: descriptive-slug, spernakit-{timestamp}-{slug}, audit-{type}-{timestamp}-{description}, or remediation-({timestamp}-)?{slug})`,
		});
	}
	if (
		feature.auditSource &&
		typeof feature.auditSource === 'string' &&
		feature.auditSource !== '' &&
		typeof feature.id === 'string'
	) {
		if (!feature.id.startsWith('audit-')) {
			issues.push({
				id,
				message: `Audit finding id must start with 'audit-' (got: '${feature.id}')`,
			});
		} else if (feature.directory && feature.id !== feature.directory) {
			issues.push({
				id,
				message: `Audit finding id must match directory name (id='${feature.id}', dir='${feature.directory}')`,
			});
		}
	}
	if (feature.passes !== undefined && typeof feature.passes !== 'boolean') {
		issues.push({ id, message: 'passes must be boolean' });
	}
	if (feature.status !== undefined && !isValidFeatureStatus(feature.status)) {
		issues.push({ id, message: `Invalid status: ${feature.status}` });
	}
	if (feature.dependencies !== undefined && !Array.isArray(feature.dependencies)) {
		issues.push({ id, message: 'dependencies must be an array' });
	}
	if (feature.passes === true && feature.status === 'backlog') {
		issues.push({ id, message: 'Feature has passes=true but status is still backlog' });
	}
	if (requiresCompletionResolutionNote(feature) && !hasResolutionNote(feature.notes)) {
		issues.push({
			id,
			message:
				'Completed audit/remediation features with passes=true must include a non-empty notes resolution',
		});
	}
	return issues;
}

// Collection-level checks that cannot be expressed by validateFeatureContract because they
// require visibility across every loaded feature: duplicate id values, mismatches between a
// feature's persisted id and its containing directory, and (as a warning) duplicate normalized
// titles among open backlog/remediation/audit work that likely represent the same item.
export function validateFeatureCollection(features: Feature[]): FeatureCollectionValidationResult {
	const issues: FeatureValidationIssue[] = [];
	const warnings: FeatureValidationIssue[] = [];

	const byId = new Map<string, Feature[]>();
	for (const feature of features) {
		if (typeof feature.id !== 'string' || feature.id === '') continue;
		const group = byId.get(feature.id) ?? [];
		group.push(feature);
		byId.set(feature.id, group);
	}
	for (const [duplicateId, group] of byId) {
		if (group.length <= 1) continue;
		const directories = group.map((feature) => feature.directory ?? feature.id).sort();
		for (const directory of directories) {
			issues.push({
				id: directory,
				message: `Duplicate feature id '${duplicateId}' shared by directories: ${directories.join(', ')}`,
			});
		}
	}

	for (const feature of features) {
		if (typeof feature.id !== 'string' || feature.id === '') continue;
		if (typeof feature.directory !== 'string' || feature.directory === '') continue;
		if (feature.id === feature.directory) continue;
		if (feature.id.startsWith('audit-')) continue;
		issues.push({
			id: feature.directory,
			message: `Feature id '${feature.id}' does not match directory name '${feature.directory}'`,
		});
	}

	const openStatuses = new Set(['backlog', 'in_progress', 'waiting_approval']);
	const byNormalizedTitle = new Map<string, Feature[]>();
	for (const feature of features) {
		const title = typeof feature.title === 'string' ? feature.title : '';
		const normalized = normalizeFeatureTitle(title);
		if (!normalized) continue;
		const status = feature.status ?? 'backlog';
		if (!openStatuses.has(status)) continue;
		const group = byNormalizedTitle.get(normalized) ?? [];
		group.push(feature);
		byNormalizedTitle.set(normalized, group);
	}
	for (const group of byNormalizedTitle.values()) {
		if (group.length <= 1) continue;
		const directories = group.map((feature) => feature.directory ?? feature.id).sort();
		for (const feature of group) {
			warnings.push({
				id: feature.directory ?? feature.id,
				message: `Open feature title likely duplicates other open features: ${directories.join(', ')}`,
			});
		}
	}

	// Soft convention (warning, never a hard failure): a shipped feature's changed files are
	// knowable from the diff at completion time, so completed work should carry affectedFiles.
	// document-changes stamps it; this flags the records that slipped through. Backlog/in-progress
	// features are exempt because their files are an output of the work, not a precondition.
	for (const feature of features) {
		if (feature.status !== 'completed' || feature.passes !== true) continue;
		if (hasAffectedFiles(feature.affectedFiles)) continue;
		warnings.push({
			id: feature.directory ?? feature.id ?? 'unknown',
			message:
				'Completed feature with passes=true is missing affectedFiles (expected from the diff)',
		});
	}

	for (const feature of features) {
		const count = countLiteralNewlines(feature);
		if (count === 0) continue;
		warnings.push({
			id: feature.directory ?? feature.id ?? 'unknown',
			message:
				`Text contains ${count} literal \\n where a newline was meant (JSON double-escape); ` +
				'numbered criteria render as one unbroken line',
		});
	}

	const edges = validateDependencyEdges(features);
	issues.push(...edges.issues);
	warnings.push(...edges.warnings);

	return { issues, warnings };
}

// A literal backslash-n written where a real newline belonged — the value was escaped twice ("\\n"
// emitted for "\n") on its way into the JSON. Nothing else catches this: the file still parses, the
// field is still a valid string, and --check-features reports it clean. It only surfaces when a
// human reads the spec and finds every numbered criterion run together on one line.
//
// Matched only where what follows looks like the START OF A NEW LINE: an optional indent, then a
// numbered item ("2."), a sentence, a heading, a bullet, another separator, or end of text. Plenty
// of specs legitimately *describe* the escape rather than use it — "renders \n, \r and \t", "so
// `\n` characters wrap", the HMAC canonical string `timestamp\nmethod\npath\nbody`, the Windows
// path `.aidd\notes.md`. Those are followed by a backtick, comma, slash, paren or lowercase word,
// and are deliberately left alone: a false positive here sends someone to "repair" correct content.
//
// The cost is undercounting separators inside an indented code block (the next line starts
// lowercase). That is cheap — such a record always carries ordinary numbered separators too, so it
// is still named. Measured on the 1325-occurrence corpus that motivated this check: identical
// feature-level recall (79/79) against a looser rule, with six fewer false positives.
const LITERAL_NEWLINE = /\\n(?=[ \t]*(?:\\n|[0-9A-Z#*]|[-+][ \t]|$))/g;

function countLiteralNewlines(feature: Feature): number {
	const texts: string[] = [];
	for (const field of [feature.title, feature.description, feature.spec, feature.notes]) {
		if (typeof field === 'string') texts.push(field);
		else if (Array.isArray(field))
			for (const entry of field) {
				if (typeof entry === 'string') texts.push(entry);
			}
	}
	let count = 0;
	for (const text of texts) count += (text.match(LITERAL_NEWLINE) ?? []).length;
	return count;
}

// Edge-level integrity for the dependency DAG. Both defects here are invisible at runtime: the
// selection gate only asks "are all my dependencies passing?", so an unsatisfiable edge is
// indistinguishable from work that simply is not done yet. The run reports every candidate as
// dependency-blocked and stops without naming a cause. Severity follows blast radius — an edge that
// can still stall selection is an issue; one that only stalls already-finished work is a warning.
function validateDependencyEdges(features: Feature[]): FeatureCollectionValidationResult {
	const issues: FeatureValidationIssue[] = [];
	const warnings: FeatureValidationIssue[] = [];
	const byRef = indexFeaturesByRef(features);
	const isSettled = (nodeName: string): boolean => byRef.get(nodeName)?.passes === true;

	for (const { id, ref } of findDanglingDependencies(features)) {
		const message = `Dependency '${ref}' matches no known feature`;
		if (isSettled(id)) {
			warnings.push({ id, message: `${message} (feature already passes; stale reference)` });
		} else {
			issues.push({ id, message: `${message}, so this feature can never be selected` });
		}
	}

	for (const { deadlocked, path } of classifyDependencyCycles(features)) {
		const rendered = path.join(' -> ');
		// A closed walk, so drop the repeated terminal node before reporting per member.
		const members = path.slice(0, -1);
		if (!deadlocked) {
			// A member already passes, so the loop drains and the runtime gate agrees the rest is
			// reachable. Reporting it as unselectable here would fail the gate on a backlog that is
			// making progress.
			warnings.push({
				id: members[0] ?? 'unknown',
				message: `Dependency cycle does not block selection because a member already passes, but the declared edges are contradictory: ${rendered}`,
			});
			continue;
		}
		for (const nodeName of members) {
			issues.push({
				id: nodeName,
				message: `Dependency cycle blocks this feature from ever being selected: ${rendered}`,
			});
		}
	}

	return { issues, warnings };
}

function hasAffectedFiles(affectedFiles: unknown): boolean {
	return (
		Array.isArray(affectedFiles) &&
		affectedFiles.some((file) => typeof file === 'string' && file.trim().length > 0)
	);
}

function normalizeFeatureTitle(title: string): string {
	return title
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.trim()
		.replace(/\s+/g, ' ');
}
