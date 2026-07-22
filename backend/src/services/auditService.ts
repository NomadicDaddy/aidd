import type { ResolvedConfig } from 'aidd-shared/config';
import type { AuditFreshnessContext } from 'aidd-shared/metadata/audit-freshness';

import {
	buildApplicabilityMatrix,
	normalizeAuditProfileMapping,
	type AuditProfileMapping,
	type AuditProfileOverrides,
} from 'aidd-shared';
import {
	loadAuditProfileMapping,
	writeAuditProfileMapping,
	auditProfileMappingPath,
	loadAuditProfileOverrides,
} from 'aidd-shared/metadata/audit-profile-mapping';
import { discoverAuditNames } from 'aidd-shared/modes/audit-shared';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type {
	AuditDefinitionDto,
	AuditManagerDto,
	ProjectAuditsDto,
	AuditLaunchInput,
} from './audit/auditTypes.ts';
import type { ProjectService } from './projectService.ts';
import type { RunService } from './runService.ts';

import { pathIsInside } from '../paths.ts';
import { recordDataMovement } from './dataMovementTrace.ts';
import { HttpError } from './errors.ts';
export type {
	AuditDefinitionDto,
	AuditManagerDto,
	ProjectAuditEntryDto,
	ProjectAuditsDto,
	AuditLaunchInput,
} from './audit/auditTypes.ts';
import type { AuditApplicabilityRow } from 'aidd-shared';

import {
	normalizeAuditName,
	definitionSummary,
	scoreAuditCatalog,
	type ProjectProfileCache,
} from './audit/auditHelpers.ts';
import { launchAuditsImpl } from './audit/launchAuditsImpl.ts';
import {
	saveProjectAuditOverridesImpl,
	listProjectAuditsImpl,
} from './audit/projectAuditHelpers.ts';

interface AuditProfileMappingDto {
	auditNames: string[];
	mapping: AuditProfileMapping;
	matrix: AuditApplicabilityRow[];
}

export class AuditService {
	private config: ResolvedConfig;
	private readonly projectService: ProjectService;
	private readonly rootDir: string;
	private readonly runService: RunService;

	constructor(
		config: ResolvedConfig,
		projectService: ProjectService,
		runService: RunService,
		rootDir: string
	) {
		this.config = config;
		this.projectService = projectService;
		this.rootDir = rootDir;
		this.runService = runService;
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
		const [definitions, scoresByAudit] = await Promise.all([
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
						(n) => this.auditPath(n)
					)
				)
			),
			scoreAuditCatalog(auditNames, this.rootDir, () => this.resolveScoringRoots()),
		]);
		const enrichedDefinitions = definitions.map((definition) => {
			const score = scoresByAudit.get(definition.name.toUpperCase());
			return score ? { ...definition, changePotential: score } : definition;
		});
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
			(n) => this.auditPath(n)
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
		input: unknown
	): Promise<AuditProfileOverrides> {
		return saveProjectAuditOverridesImpl(
			projectId,
			input,
			(id) => this.projectService.resolveDiscoveredProject(id),
			this.rootDir
		);
	}

	async listProjectAudits(projectId: string): Promise<ProjectAuditsDto> {
		return listProjectAuditsImpl(
			projectId,
			(id) => this.projectService.resolveDiscoveredProject(id),
			this.rootDir,
			this.config.auditsEnabled ?? true,
			(n) => this.auditPath(n),
			() => this.resolveScoringRoots()
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
			launchRun: (request) => this.runService.launchRun(request),
			resolveProject: (id) => this.projectService.resolveDiscoveredProject(id),
		});
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
