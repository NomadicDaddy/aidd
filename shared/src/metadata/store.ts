import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
	type Feature,
	FEATURE_STATUSES,
	featureMatchesQuery,
	type FeatureQuery,
	featureSchema,
	type FeatureStats,
	type FeatureValidationResult,
	isValidFeatureStatus,
	summarizeFeatures,
} from './features.ts';
import { type IterationRecord } from './iterations.ts';
import { metadataPath, STOP_FILE } from './paths.ts';
import {
	type Roadmap,
	roadmapSchema,
	selectAssignmentMilestone,
	serializeRoadmap,
} from './roadmap.ts';
import { type ArtifactCheckResult, runArtifactCheck } from './store/artifacts.ts';
import {
	generateChangelog,
	listAuditReports,
	readAuditReport,
	writeAuditReport,
	writeChangelog,
} from './store/documents.ts';
import { InvalidRoadmapError } from './store/errors.ts';
import { collectFeatureReadFailures, type FeatureReadFailure } from './store/read-failures.ts';
import { appendRunSummary, writeIteration } from './store/runHistory.ts';
import { serializeFeatureForWrite } from './store/serialize.ts';
import { applyCreationStatusPolicy } from './store/status-policy.ts';
import { evaluateFeatureValidation } from './store/validation.ts';

export { type ArtifactCheckResult, type ArtifactStatus } from './store/artifacts.ts';
export { InvalidRoadmapError } from './store/errors.ts';
export { type FeatureReadFailure } from './store/read-failures.ts';

export interface AiddStore {
	appendRunSummary(summary: Record<string, unknown>): Promise<void>;
	checkArtifacts(): Promise<ArtifactCheckResult>;
	ensureFeatureAssigned(feature: Feature): Promise<void>;
	generateChangelog(): Promise<string>;
	getFeatureStats(query?: FeatureQuery): Promise<FeatureStats>;
	hasStopRequested(stopFile?: string): Promise<boolean>;
	listAuditReports(): Promise<string[]>;
	listFeatureReadFailures(): Promise<FeatureReadFailure[]>;
	listFeatures(query?: FeatureQuery): Promise<Feature[]>;
	readAuditReport(filename: string): Promise<string>;
	readFeature(id: string): Promise<Feature>;
	readRoadmap(): Promise<Roadmap>;
	validateFeatures(query?: FeatureQuery): Promise<FeatureValidationResult>;
	writeAuditReport(auditName: string, content: string, timestamp?: Date): Promise<string>;
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

	private featurePath(id: string): string {
		return join(this.metadataDir, 'features', id, 'feature.json');
	}

	async listFeatures(query: FeatureQuery = {}): Promise<Feature[]> {
		const featuresDir = join(this.metadataDir, 'features');
		let entries: string[];
		try {
			entries = await readdir(featuresDir);
		} catch {
			return [];
		}
		const features: Feature[] = [];
		for (const entry of entries) {
			try {
				const feature = await this.readFeature(entry);
				if (featureMatchesQuery(feature, query)) features.push(feature);
			} catch {
				continue;
			}
		}
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
		const raw = await readFile(this.featurePath(id), 'utf8');
		const feature = featureSchema.parse(JSON.parse(raw));
		feature.directory = id;
		return feature;
	}

	private async persistFeatureFile(feature: Feature): Promise<void> {
		const id = feature.id;
		const persistedFeature = serializeFeatureForWrite(feature);
		await mkdir(join(this.metadataDir, 'features', id), { recursive: true });
		await writeFile(this.featurePath(id), `${JSON.stringify(persistedFeature, null, 2)}\n`);
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
		const resolved = await applyCreationStatusPolicy(feature, {
			featureExists: () =>
				stat(this.featurePath(feature.id)).then(
					() => true,
					() => false,
				),
			listFeatures: () => this.listFeatures({ includeAudit: true }),
			readRoadmap: () => this.readRoadmap(),
		});
		await this.persistFeatureFile(resolved);
		await this.ensureFeatureAssigned(resolved);
	}

	// Roadmap-assignment invariant: every persisted feature must be mapped to a milestone
	// while roadmap.json is present. Idempotent for already-mapped features (no roadmap
	// rewrite), so routine feature metadata writes incur no churn. Unmapped/invalid features
	// are assigned per selectAssignmentMilestone and their priority is synced back into
	// feature.json (same priority propagation as aidd-tools roadmap:apply).
	async ensureFeatureAssigned(feature: Feature): Promise<void> {
		let roadmap: Roadmap;
		try {
			roadmap = await this.readRoadmap();
		} catch {
			return;
		}
		const directory = feature.directory ?? feature.id;
		const existingMilestone = roadmap.features[directory]?.milestone;
		if (existingMilestone && roadmap.milestones[existingMilestone]) {
			await this.syncFeaturePriority(feature, roadmap, existingMilestone);
			return;
		}
		const features = await this.listFeatures({ includeAudit: true });
		const selection = selectAssignmentMilestone(roadmap, features, directory);
		const updatedRoadmap: Roadmap = {
			...roadmap,
			features: {
				...roadmap.features,
				[directory]: {
					...(roadmap.features[directory] ?? {}),
					milestone: selection.milestone,
				},
			},
			milestones: selection.createdMilestone
				? { ...roadmap.milestones, [selection.milestone]: selection.createdMilestone }
				: roadmap.milestones,
		};
		await this.writeRoadmap(updatedRoadmap);
		await this.syncFeaturePriority(feature, updatedRoadmap, selection.milestone);
	}

	private async syncFeaturePriority(
		feature: Feature,
		roadmap: Roadmap,
		milestone: string,
	): Promise<void> {
		const priority = roadmap.milestones[milestone]?.priority;
		if (priority === undefined) return;
		if (feature.priority !== undefined && Number(feature.priority) === priority) return;
		await this.persistFeatureFile({ ...feature, priority });
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
	): Promise<string> {
		return await writeAuditReport(this.projectDir, auditName, content, timestamp);
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
