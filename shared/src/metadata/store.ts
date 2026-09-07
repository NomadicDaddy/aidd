import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { AuditReportFindingReference } from './audit-freshness.ts';
import type {
	FindingLedgerEvent,
	FindingLedgerEventInput,
	FindingLedgerRead,
} from './findings-ledger.ts';

import {
	type Feature,
	FEATURE_STATUSES,
	featureMatchesQuery,
	type FeatureQuery,
	type FeatureStats,
	type FeatureValidationResult,
	isValidFeatureStatus,
	summarizeFeatures,
} from './features.ts';
import { type IterationRecord } from './iterations.ts';
import { metadataPath, STOP_FILE } from './paths.ts';
import { type Roadmap, roadmapSchema, serializeRoadmap } from './roadmap.ts';
import { type ArtifactCheckResult, runArtifactCheck } from './store/artifacts.ts';
import { ensureFeatureAssigned as ensureFeatureRoadmapAssignment } from './store/assignment.ts';
import {
	generateChangelog,
	listAuditReports,
	readAuditReport,
	writeAuditReport,
	writeChangelog,
} from './store/documents.ts';
import { InvalidRoadmapError } from './store/errors.ts';
import {
	featureFilePath,
	persistFeatureFile,
	readExistingFeature,
	readFeatureFile,
} from './store/feature-files.ts';
import { remediatedFindingEvent, remediationCandidate } from './store/finding-lifecycle.ts';
import { collectFeatureReadFailures, type FeatureReadFailure } from './store/read-failures.ts';
import {
	appendFindingEvent,
	appendRunSummary,
	readFindingEvents,
	writeIteration,
} from './store/runHistory.ts';
import { applyCompletionTimestamp, applyCreationStatusPolicy } from './store/status-policy.ts';
import { evaluateFeatureValidation } from './store/validation.ts';

export { type ArtifactCheckResult, type ArtifactStatus } from './store/artifacts.ts';
export { InvalidRoadmapError } from './store/errors.ts';
export { type FeatureReadFailure } from './store/read-failures.ts';

export interface AiddStore {
	appendFindingEvent(event: FindingLedgerEventInput): Promise<void>;
	appendRunSummary(summary: Record<string, unknown>): Promise<void>;
	checkArtifacts(): Promise<ArtifactCheckResult>;
	ensureFeatureAssigned(feature: Feature): Promise<void>;
	generateChangelog(): Promise<string>;
	getFeatureStats(query?: FeatureQuery): Promise<FeatureStats>;
	hasStopRequested(stopFile?: string): Promise<boolean>;
	listAuditReports(): Promise<string[]>;
	listFeatureReadFailures(): Promise<FeatureReadFailure[]>;
	listFeatures(query?: FeatureQuery): Promise<Feature[]>;
	/** The project this store is rooted at — needed by callers whose behavior depends on which
	 * repository the metadata belongs to (see metadata/reconcile.ts), not just on its contents. */
	readonly projectDir: string;
	readAuditReport(filename: string): Promise<string>;
	readFeature(id: string): Promise<Feature>;
	/** Parsed ledger events only; see readFindingLedger for the skipped-line count. */
	readFindingEvents(): Promise<FindingLedgerEvent[]>;
	readFindingLedger(): Promise<FindingLedgerRead>;
	readRoadmap(): Promise<Roadmap>;
	validateFeatures(query?: FeatureQuery): Promise<FeatureValidationResult>;
	writeAuditReport(
		auditName: string,
		content: string,
		timestamp?: Date,
		findings?: AuditReportFindingReference[],
	): Promise<string>;
	writeChangelog(content?: string): Promise<string>;
	writeFeature(feature: Feature): Promise<void>;
	writeIteration(record: IterationRecord): Promise<number>;
	writeRoadmap(roadmap: Roadmap): Promise<void>;
}

export class FileAiddStore implements AiddStore {
	readonly metadataDir: string;
	readonly projectDir: string;

	constructor(projectDir: string) {
		this.projectDir = projectDir;
		this.metadataDir = metadataPath(projectDir);
	}

	async listFeatures(query: FeatureQuery = {}): Promise<Feature[]> {
		const featuresDir = join(this.metadataDir, 'features');
		let entries: string[];
		try {
			entries = await readdir(featuresDir);
		} catch {
			return [];
		}
		// Read concurrently: the entries are independent files, so the sequential await only ever
		// serialised I/O latency (28.9 ms against 4.8 ms on a 329-feature backlog). Unreadable or
		// invalid entries still yield null and are skipped, exactly as the per-entry catch did.
		const results = await Promise.all(
			entries.map(async (entry) => {
				try {
					return await this.readFeature(entry);
				} catch {
					return null;
				}
			}),
		);
		const features = results.filter(
			(feature): feature is Feature =>
				feature !== null && featureMatchesQuery(feature, query),
		);
		return features.sort((a, b) => (a.directory ?? a.id).localeCompare(b.directory ?? b.id));
	}

	async listFeatureReadFailures(): Promise<FeatureReadFailure[]> {
		return collectFeatureReadFailures(this.metadataDir, (directory) =>
			this.readFeature(directory),
		);
	}

	async getFeatureStats(query: FeatureQuery = {}): Promise<FeatureStats> {
		return summarizeFeatures(
			await this.listFeatures({ ...query, includeAudit: query.includeAudit ?? true }),
		);
	}

	async readFeature(id: string): Promise<Feature> {
		return readFeatureFile(this.metadataDir, id);
	}

	async writeFeature(feature: Feature): Promise<void> {
		// Refuse to persist a status outside the canonical vocabulary — strays like 'done'
		// or 'verified' are invalid data that downstream readers must never have to alias.
		if (feature.status !== undefined && !isValidFeatureStatus(feature.status)) {
			throw new Error(
				`Invalid feature status '${feature.status}' for '${feature.directory ?? feature.id}' — allowed: ${FEATURE_STATUSES.join(', ')}`,
			);
		}
		// Brand-new roadmap-planned work mapped beyond MVP is born waiting_approval
		// (see store/status-policy.ts); updates to existing features never restatus.
		const id = feature.directory ?? feature.id;
		const existingFeature = await readExistingFeature(this.metadataDir, id);
		const resolved = await applyCreationStatusPolicy(feature, {
			featureExists: () =>
				stat(featureFilePath(this.metadataDir, id)).then(
					() => true,
					() => false,
				),
			listFeatures: () => this.listFeatures({ includeAudit: true }),
			readRoadmap: () => this.readRoadmap(),
		});
		// Completion instant, stamped here rather than at any one call site: the agent editing
		// feature.json, a web status edit and the reconcile pass all land in this one writer.
		// The assignment pass gets the stamped record too — it can persist a priority-synced copy,
		// and handing it the pre-stamp one would write the timestamp straight back out.
		const stamped = applyCompletionTimestamp(resolved);
		// The remediation event lands before feature.json: if the append fails the record stays
		// in its prior state rather than reading completed with no ledger trace. The ledger, not
		// the previous status, decides whether this completion is the first (see finding-lifecycle).
		const remediationEvent = remediatedFindingEvent(
			existingFeature,
			stamped,
			id,
			remediationCandidate(existingFeature, stamped) ? await this.readFindingEvents() : [],
		);
		if (remediationEvent) await this.appendFindingEvent(remediationEvent);
		await persistFeatureFile(this.metadataDir, stamped);
		await this.ensureFeatureAssigned(stamped);
	}

	// Roadmap-assignment invariant: every persisted feature must be mapped to a milestone
	// while roadmap.json is present. Idempotent for already-mapped features (no roadmap
	// rewrite), so routine feature metadata writes incur no churn. Unmapped/invalid features
	// are assigned per selectAssignmentMilestone and their priority is synced back into
	// feature.json (same priority propagation as aidd-tools roadmap:apply).
	async ensureFeatureAssigned(feature: Feature): Promise<void> {
		await ensureFeatureRoadmapAssignment(feature, {
			listFeatures: () => this.listFeatures({ includeAudit: true }),
			persistFeature: (updated) => persistFeatureFile(this.metadataDir, updated),
			readRoadmap: () => this.readRoadmap(),
			writeRoadmap: (roadmap) => this.writeRoadmap(roadmap),
		});
	}

	async readRoadmap(): Promise<Roadmap> {
		const filePath = join(this.metadataDir, 'roadmap.json');
		const raw = await readFile(filePath, 'utf8');
		let parsed: unknown;
		try {
			parsed = JSON.parse(raw);
		} catch (error) {
			throw new InvalidRoadmapError({
				cause: error,
				filePath,
				raw,
			});
		}
		return roadmapSchema.parse(parsed);
	}

	async writeRoadmap(roadmap: Roadmap): Promise<void> {
		await mkdir(this.metadataDir, { recursive: true });
		await writeFile(join(this.metadataDir, 'roadmap.json'), serializeRoadmap(roadmap));
	}

	async writeIteration(record: IterationRecord): Promise<number> {
		return await writeIteration(this.metadataDir, record);
	}

	async appendFindingEvent(event: FindingLedgerEventInput): Promise<void> {
		await appendFindingEvent(this.metadataDir, event);
	}

	async readFindingEvents(): Promise<FindingLedgerEvent[]> {
		return (await readFindingEvents(this.metadataDir)).events;
	}

	async readFindingLedger(): Promise<FindingLedgerRead> {
		return await readFindingEvents(this.metadataDir);
	}

	// .aidd/runs.jsonl is the project-local aidd run ledger written by the orchestrator. It is
	// never committed: it is ignored in every profile, and aidd makes no commits of its own. It is
	// also NOT the web process tracking surface — web-launched process records live in the SQLite
	// `runs` table (see RunService).
	async appendRunSummary(summary: Record<string, unknown>): Promise<void> {
		await appendRunSummary(this.metadataDir, summary);
	}

	async generateChangelog(): Promise<string> {
		return await generateChangelog(this.metadataDir);
	}

	async writeChangelog(content?: string): Promise<string> {
		return await writeChangelog(this.metadataDir, content);
	}

	async listAuditReports(): Promise<string[]> {
		return await listAuditReports(this.metadataDir);
	}

	async readAuditReport(filename: string): Promise<string> {
		return await readAuditReport(this.metadataDir, filename);
	}

	async writeAuditReport(
		auditName: string,
		content: string,
		timestamp = new Date(),
		findings: AuditReportFindingReference[] = [],
	): Promise<string> {
		return await writeAuditReport(this.projectDir, auditName, content, timestamp, findings);
	}

	async validateFeatures(query: FeatureQuery = {}): Promise<FeatureValidationResult> {
		const features = await this.listFeatures({
			...query,
			includeAudit: query.includeAudit ?? true,
		});
		return evaluateFeatureValidation(features, () => this.readRoadmap());
	}

	async checkArtifacts(): Promise<ArtifactCheckResult> {
		return runArtifactCheck(this.projectDir, this.metadataDir);
	}

	async hasStopRequested(stopFile = join(this.metadataDir, STOP_FILE)): Promise<boolean> {
		try {
			await stat(stopFile);
			return true;
		} catch {
			return false;
		}
	}
}
