import type { ResolvedConfig } from 'aidd-shared/config';
import type { AuditFreshnessContext } from 'aidd-shared/metadata/audit-freshness';

import {
	type AuditProfileOverrides,
	buildApplicabilityMatrix,
	normalizeAuditProfileMapping,
} from 'aidd-shared';
import {
	auditProfileMappingPath,
	loadAuditProfileMapping,
	loadAuditProfileOverrides,
	writeAuditProfileMapping,
} from 'aidd-shared/metadata/audit-profile-mapping';
import { discoverAuditNames } from 'aidd-shared/modes/audit-shared';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { WebDatabase } from '../db/client.ts';
import type {
	AuditDefinitionDto,
	AuditLaunchInput,
	AuditManagerDto,
	AuditProfileMappingDto,
	ProjectAuditsDto,
} from './audit/auditTypes.ts';
import type { ProjectService } from './projectService.ts';
import type { RunService } from './runService.ts';
import type { TelemetryService } from './telemetryService.ts';

import { pathIsInside } from '../paths.ts';
import { recordDataMovement } from './dataMovementTrace.ts';
import { HttpError } from './errors.ts';
import { attachAuditOutcomes, collectAuditOutcomes } from './outcome/auditOutcomes.ts';
export type {
	AuditDefinitionDto,
	AuditLaunchInput,
	AuditManagerDto,
	ProjectAuditsDto,
} from './audit/auditTypes.ts';
import {
	definitionSummary,
	normalizeAuditName,
	type ProjectProfileCache,
	scoreAuditCatalog,
} from './audit/auditHelpers.ts';
import { recordAuditRunStart } from './audit/auditTelemetry.ts';
import { launchAuditsImpl } from './audit/launchAuditsImpl.ts';
import {
	listProjectAuditsImpl,
	saveProjectAuditOverridesImpl,
} from './audit/projectAuditHelpers.ts';

export class AuditService {
	private config: ResolvedConfig;
	private readonly projectService: ProjectService;
	private readonly db: undefined | WebDatabase;
	private readonly rootDir: string;
	private readonly runService: RunService;
	private readonly telemetryService: TelemetryService | undefined;

	constructor(
		config: ResolvedConfig,
		projectService: ProjectService,
		runService: RunService,
		rootDir: string,
		telemetryService?: TelemetryService,
		db?: WebDatabase,
	) {
		this.config = config;
		this.projectService = projectService;
		this.db = db;
		this.rootDir = rootDir;
		this.runService = runService;
		this.telemetryService = telemetryService;
	}

	updateConfig(config: ResolvedConfig): void {
		this.config = config;
	}

	async listAuditManager(): Promise<AuditManagerDto> {
		const [auditNames, projectList, mapping] = await Promise.all([
			discoverAuditNames(this.rootDir),
			this.projectService.listProjects(),
			loadAuditProfileMapping(this.rootDir),
		]);
		const projects = projectList.projects.map((project) => ({
			id: project.id,
			name: project.name,
			path: project.path,
		}));
		const matrixRows = buildApplicabilityMatrix(auditNames, mapping);
		const matrixIndex = new Map(matrixRows.map((row) => [row.auditName.toUpperCase(), row]));
		const freshnessContexts = new Map<string, AuditFreshnessContext>();
		const profileCache: ProjectProfileCache = new Map();
		const [definitions, outcomesByAudit, scoresByAudit] = await Promise.all([
			Promise.all(
				auditNames.map((name) =>
					definitionSummary(
						name,
						projectList.projects,
						mapping,
						matrixIndex,
						freshnessContexts,
						profileCache,
						this.config.auditsEnabled ?? true,
						(n) => this.auditPath(n),
					),
				),
			),
			collectAuditOutcomes(
				this.db,
				projects.map((project) => project.path),
				auditNames,
			),
			scoreAuditCatalog(auditNames, this.rootDir, () => this.resolveScoringRoots()),
		]);
		const enrichedDefinitions = attachAuditOutcomes(
			definitions,
			outcomesByAudit,
			scoresByAudit,
		);
		return {
			auditsEnabled: this.config.auditsEnabled ?? true,
			definitions: enrichedDefinitions,
			projects,
		};
	}

	async readAuditDefinition(name: string): Promise<AuditDefinitionDto> {
		const mapping = await loadAuditProfileMapping(this.rootDir);
		const auditNames = await discoverAuditNames(this.rootDir);
		const matrixRows = buildApplicabilityMatrix(auditNames, mapping);
		const matrixIndex = new Map(matrixRows.map((row) => [row.auditName.toUpperCase(), row]));
		const definition = await definitionSummary(
			name,
			[],
			mapping,
			matrixIndex,
			new Map<string, AuditFreshnessContext>(),
			new Map(),
			this.config.auditsEnabled ?? true,
			(n) => this.auditPath(n),
		);
		return { ...definition, content: await readFile(definition.path, 'utf8') };
	}

	async getAuditProfileMapping(): Promise<AuditProfileMappingDto> {
		const [auditNames, mapping] = await Promise.all([
			discoverAuditNames(this.rootDir),
			loadAuditProfileMapping(this.rootDir),
		]);
		return {
			auditNames,
			mapping,
			matrix: buildApplicabilityMatrix(auditNames, mapping),
		};
	}

	async saveAuditProfileMapping(input: unknown): Promise<AuditProfileMappingDto> {
		const normalized = normalizeAuditProfileMapping(input);
		const auditNames = await discoverAuditNames(this.rootDir);
		const knownAudits = new Set(auditNames.map((name) => name.toUpperCase()));
		for (const rule of normalized.rules) {
			for (const audit of rule.audits) {
				if (audit === '*') continue;
				if (!knownAudits.has(audit.toUpperCase())) {
					throw new HttpError(`Rule ${rule.id} references unknown audit: ${audit}`, 400);
				}
			}
		}
		const target = auditProfileMappingPath(this.rootDir);
		const mapping = await writeAuditProfileMapping(this.rootDir, normalized);
		recordDataMovement({
			category: 'metadata',
			operation: 'audit.profile-mapping.write',
			status: 'success',
			summary: { ruleCount: mapping.rules.length },
			target,
		});
		return {
			auditNames,
			mapping,
			matrix: buildApplicabilityMatrix(auditNames, mapping),
		};
	}

	async getProjectAuditOverrides(projectId: string): Promise<AuditProfileOverrides> {
		const projectDir = await this.projectService.resolveDiscoveredProject(projectId);
		let existing: AuditProfileOverrides | null;
		try {
			existing = await loadAuditProfileOverrides(projectDir);
		} catch (err) {
			throw new HttpError(err instanceof Error ? err.message : String(err), 422);
		}
		if (existing) return existing;
		return {
			audits: {},
			rules: [],
			updatedAt: new Date(0).toISOString(),
			version: 1,
		};
	}

	async saveProjectAuditOverrides(
		projectId: string,
		input: unknown,
	): Promise<AuditProfileOverrides> {
		return saveProjectAuditOverridesImpl(
			projectId,
			input,
			(id) => this.projectService.resolveDiscoveredProject(id),
			this.rootDir,
		);
	}

	async listProjectAudits(projectId: string): Promise<ProjectAuditsDto> {
		return listProjectAuditsImpl(
			projectId,
			(id) => this.projectService.resolveDiscoveredProject(id),
			this.rootDir,
			this.config.auditsEnabled ?? true,
			(n) => this.auditPath(n),
			() => this.resolveScoringRoots(),
		);
	}

	async saveAuditDefinition(name: string, content: string): Promise<AuditDefinitionDto> {
		const target = this.auditPath(name);
		const trimmed = content.trim();
		if (trimmed.length < 10) throw new HttpError('Audit definition content is too short.', 400);
		if (!/^#\s+/m.test(trimmed)) {
			throw new HttpError('Audit definition must include a markdown heading.', 400);
		}
		await mkdir(this.auditDir(), { recursive: true });
		await writeFile(target, `${trimmed}\n`);
		recordDataMovement({
			category: 'metadata',
			operation: 'audit.definition.write',
			status: 'success',
			summary: { auditName: name },
			target,
		});
		return await this.readAuditDefinition(name);
	}

	async launchAudits(input: AuditLaunchInput): Promise<{ failures: string[]; runIds: string[] }> {
		return launchAuditsImpl(input, {
			auditsEnabled: this.config.auditsEnabled ?? true,
			launchRun: (request, options) => this.runService.launchRun(request, options),
			recordRunStart: (run, auditNames) =>
				recordAuditRunStart(this.telemetryService, run, 'web', auditNames),
			resolveProject: (id) => this.projectService.resolveDiscoveredProject(id),
		});
	}

	async launchAuditsForPaths(
		input: { projectPaths: string[] } & Omit<AuditLaunchInput, 'projectIds'>,
	): Promise<{ failures: string[]; runIds: string[] }> {
		return launchAuditsImpl(
			{ ...input, projectIds: input.projectPaths },
			{
				auditsEnabled: this.config.auditsEnabled ?? true,
				launchRun: (request, options) => this.runService.launchRun(request, options),
				recordRunStart: (run, auditNames) =>
					recordAuditRunStart(
						this.telemetryService,
						run,
						input.source ?? 'web',
						auditNames,
					),
				resolveProject: (path) => this.projectService.resolveProjectPath(path),
			},
		);
	}

	private auditDir(): string {
		return resolve(this.rootDir, 'audits');
	}

	private auditPath(name: string): string {
		const normalized = normalizeAuditName(name);
		const target = resolve(this.auditDir(), `${normalized}.md`);
		if (!pathIsInside(this.auditDir(), target)) {
			throw new HttpError('Audit path escapes the audit catalog.', 400);
		}
		return target;
	}

	private resolveScoringRoots(): string[] {
		const roots = new Set<string>();
		if (this.config.applicationsRoot) roots.add(resolve(this.config.applicationsRoot));
		for (const root of this.config.web?.allowedRoots ?? []) {
			roots.add(resolve(root));
		}
		return [...roots];
	}
}
