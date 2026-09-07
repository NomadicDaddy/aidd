// I/O collectors for audit change-potential scoring: they read the run ledger, feature
// backlog, and audit-report coverage so the pure scorer in `./scorer.ts` stays testable.

import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { aggregateFindingOutcomes } from '../../outcome-measures.ts';
import { type Feature, featureSchema } from '../features.ts';
import { METADATA_DIR } from '../paths.ts';
import { readFindingEvents } from '../store/runHistory.ts';
import { type AuditPriority, extractPriorityFromFrontmatter } from './scorer.ts';

// Per-root child-directory deny-list when enumerating projects. The leading `.`/`_`
// prefix filter handles dotted dirs (`.git`, `.aidd`, `.old`, `.next`, …) so this set
// only needs to name non-dot entries we want to skip.
export const IGNORED_DIRS: ReadonlySet<string> = new Set([
	'build',
	'coverage',
	'dist',
	'node_modules',
	'out',
	'temp',
	'tmp',
]);

// Tail-truncate the runs ledger so a long-lived project does not turn one scorer call
// into a megabyte read. Five hundred entries is well over a year of activity in practice.
const RUNS_LEDGER_TAIL_LINES = 500;

// Per-project counts keyed by uppercase audit name. Built once per project, reused
// across all audits via `buildScoreInput`.
export interface ProjectAuditEvidence {
	activeAuditFeatures: Map<string, number>;
	completedRunsWithFindings: Map<string, number>;
	hasAuditReport: Set<string>;
	hasCompletedAuditFeature: Set<string>;
	incompleteAuditRuns: Map<string, number>;
	// Audit runs the ledger cannot credit to a named audit: a null or empty driverId, or an
	// entry with no per-audit finding breakdown. They are counted, never
	// guessed, so a batch total is never applied to every audit in the batch.
	unattributedAuditRuns: number;
}

export async function collectProjectEvidence(projectDir: string): Promise<ProjectAuditEvidence> {
	const evidence: ProjectAuditEvidence = {
		activeAuditFeatures: new Map(),
		completedRunsWithFindings: new Map(),
		hasAuditReport: new Set(),
		hasCompletedAuditFeature: new Set(),
		incompleteAuditRuns: new Map(),
		unattributedAuditRuns: 0,
	};
	const auditsWithLedgerEvidence = await collectFindingLedger(projectDir, evidence);
	await collectRunLedger(projectDir, evidence);
	await collectFeatures(projectDir, evidence, auditsWithLedgerEvidence);
	await collectAuditReports(projectDir, evidence);
	return evidence;
}

async function collectFindingLedger(
	projectDir: string,
	evidence: ProjectAuditEvidence,
): Promise<Set<string>> {
	const events = await readFindingEvents(join(projectDir, METADATA_DIR)).then(
		(ledger) => ledger.events,
		() => [],
	);
	const outcomes = aggregateFindingOutcomes(events);
	const auditsWithLedgerEvidence = new Set<string>();
	for (const [auditName, measures] of outcomes.byAudit) {
		const active = measures.buckets.emitted + measures.buckets.recurred;
		if (active > 0) evidence.activeAuditFeatures.set(auditName, active);
		if (measures.remediated > 0) evidence.hasCompletedAuditFeature.add(auditName);
		// Suppressed observations create no feature directory, so an audit whose ledger holds
		// only suppressions still needs its feature directories read.
		const unsuppressed =
			measures.findingCount - measures.suppressedDismissed - measures.suppressedDuplicate;
		if (unsuppressed > 0) auditsWithLedgerEvidence.add(auditName);
	}
	return auditsWithLedgerEvidence;
}

// The per-audit finding breakdown `audit.ts` writes on every audit run ledger entry, keyed by
// upper-cased audit name. Absent on entries older than the breakdown.
function auditFindingBreakdown(value: unknown): Map<string, number> | undefined {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
	const breakdown = new Map<string, number>();
	for (const [name, count] of Object.entries(value)) {
		if (typeof count === 'number' && Number.isFinite(count)) {
			breakdown.set(name.trim().toUpperCase(), count);
		}
	}
	return breakdown;
}

async function collectRunLedger(projectDir: string, evidence: ProjectAuditEvidence): Promise<void> {
	const ledgerPath = join(projectDir, METADATA_DIR, 'runs.jsonl');
	let body: string;
	try {
		body = await readFile(ledgerPath, 'utf8');
	} catch {
		return;
	}
	const allLines = body.split(/\r?\n/).filter((line) => line.length > 0);
	const lines =
		allLines.length > RUNS_LEDGER_TAIL_LINES
			? allLines.slice(allLines.length - RUNS_LEDGER_TAIL_LINES)
			: allLines;
	for (const line of lines) {
		let parsed: unknown;
		try {
			parsed = JSON.parse(line);
		} catch {
			continue;
		}
		if (typeof parsed !== 'object' || parsed === null) continue;
		const entry = parsed as {
			auditFindings?: unknown;
			driverId?: unknown;
			driverKind?: unknown;
			stopReason?: unknown;
		};
		if (entry.driverKind !== 'audit') continue;
		const auditNames =
			typeof entry.driverId === 'string'
				? entry.driverId
						.split('+')
						.map((name) => name.trim().toUpperCase())
						.filter((name) => name.length > 0)
				: [];
		const breakdown = auditFindingBreakdown(entry.auditFindings);
		if (auditNames.length === 0 || breakdown === undefined) {
			evidence.unattributedAuditRuns += 1;
			continue;
		}
		for (const auditName of auditNames) {
			recordAuditRunEvidence(
				auditName,
				breakdown.get(auditName) ?? 0,
				entry.stopReason,
				evidence,
			);
		}
	}
}

function recordAuditRunEvidence(
	auditName: string,
	findingCount: number,
	stopReason: unknown,
	evidence: ProjectAuditEvidence,
): void {
	if (stopReason === 'completed' && findingCount > 0) {
		incrementCounter(evidence.completedRunsWithFindings, auditName);
	} else {
		incrementCounter(evidence.incompleteAuditRuns, auditName);
	}
}

async function collectFeatures(
	projectDir: string,
	evidence: ProjectAuditEvidence,
	auditsWithLedgerEvidence: ReadonlySet<string>,
): Promise<void> {
	const featuresDir = join(projectDir, METADATA_DIR, 'features');
	let entries: string[];
	try {
		entries = await readdir(featuresDir);
	} catch {
		return;
	}
	for (const entry of entries) {
		const file = join(featuresDir, entry, 'feature.json');
		let raw: string;
		try {
			raw = await readFile(file, 'utf8');
		} catch {
			continue;
		}
		let feature: Feature;
		try {
			feature = featureSchema.parse(JSON.parse(raw));
		} catch {
			continue;
		}
		const auditName = auditNameFromFeature(feature, entry);
		if (!auditName) continue;
		// Once an audit has ledger evidence, its append-only lifecycle is authoritative. Falling
		// back to mutable feature directories only for audits without any avoids double-counting
		// the same finding while still reading evidence an audit wrote nowhere else.
		if (auditsWithLedgerEvidence.has(auditName)) continue;
		if (feature.status === 'completed') {
			evidence.hasCompletedAuditFeature.add(auditName);
		} else {
			incrementCounter(evidence.activeAuditFeatures, auditName);
		}
	}
}

// Feature can declare its source either via the `auditSource` field or via the
// `audit-<lower-snake>-<timestamp>-<slug>` directory convention; check both.
function auditNameFromFeature(feature: Feature, directoryName: string): string | undefined {
	if (typeof feature.auditSource === 'string' && feature.auditSource.trim().length > 0) {
		return feature.auditSource.trim().toUpperCase();
	}
	const directoryMatch = directoryName.match(/^audit-([a-z][a-z0-9_-]*?)-\d+-/);
	if (!directoryMatch || !directoryMatch[1]) return undefined;
	return directoryMatch[1].replace(/-/g, '_').toUpperCase();
}

async function collectAuditReports(
	projectDir: string,
	evidence: ProjectAuditEvidence,
): Promise<void> {
	const reportsDir = join(projectDir, METADATA_DIR, 'audit-reports');
	let entries: string[];
	try {
		entries = await readdir(reportsDir);
	} catch {
		return;
	}
	for (const entry of entries) {
		if (!entry.endsWith('.md')) continue;
		// Report filenames are `<AUDIT_NAME>-YYYY-MM-DD.md`. The audit name is everything
		// before the trailing `-YYYY-MM-DD.md` segment.
		const dateBoundary = entry.search(/-\d{4}-\d{2}-\d{2}\.md$/);
		if (dateBoundary <= 0) continue;
		evidence.hasAuditReport.add(entry.slice(0, dateBoundary).toUpperCase());
	}
}

function incrementCounter(map: Map<string, number>, key: string): void {
	map.set(key, (map.get(key) ?? 0) + 1);
}

export async function loadAuditPriorities(
	catalogDir: string,
	auditNames: readonly string[],
): Promise<Map<string, AuditPriority | null>> {
	const map = new Map<string, AuditPriority | null>();
	await Promise.all(
		auditNames.map(async (name) => {
			const key = name.toUpperCase();
			const file = join(catalogDir, 'audits', `${name}.md`);
			try {
				const body = await readFile(file, 'utf8');
				map.set(key, extractPriorityFromFrontmatter(body));
			} catch {
				map.set(key, null);
			}
		}),
	);
	return map;
}

// Enumerate direct child directories of every configured root, deduplicated. Skips
// dotted, underscore-prefixed, and IGNORED_DIRS entries. Read failures on a root are
// silently skipped — a misconfigured allowedRoot should not break audit scoring.
export async function enumerateProjectsUnderRoots(roots: readonly string[]): Promise<string[]> {
	const seen = new Set<string>();
	for (const root of roots) {
		if (!root) continue;
		let entries: string[];
		try {
			entries = await readdir(root);
		} catch {
			continue;
		}
		for (const entry of entries) {
			if (entry.startsWith('.') || entry.startsWith('_')) continue;
			if (IGNORED_DIRS.has(entry)) continue;
			const full = join(root, entry);
			try {
				const info = await stat(full);
				if (info.isDirectory()) seen.add(full);
			} catch {
				continue;
			}
		}
	}
	return [...seen];
}
