import type { Feature } from 'aidd-shared/metadata/features';

import type { PortStatusMap } from '../../backend/src/services/project/portStatusService.ts';
import type { ProjectSummaryDto, WebFeatureStatusEntryDto } from '../../backend/src/types.ts';

/**
 * The fleet the PERFORMANCE audit measured: 37 projects carrying 2,698 feature-status records,
 * whose `/api/v1/projects` response weighed 1,399,653 bytes. Shared by the two tests that hold the
 * dashboard-summary endpoint to a payload budget, so both size claims describe the same fleet.
 */
export const DASHBOARD_FIXTURE_PROJECT_COUNT = 37;
export const DASHBOARD_FIXTURE_FEATURE_RECORDS = 2698;

const FEATURE_TYPES = ['audit', 'feature', 'remediation'] as const;

/** Roughly one record in 23 is parked for approval, which is what the fleet looked like. */
const WAITING_EVERY = 23;

function featureRecord(projectIndex: number, index: number): WebFeatureStatusEntryDto {
	const type = FEATURE_TYPES[index % FEATURE_TYPES.length] ?? 'feature';
	// Directories really are this long: the audit that produced this fixture is filed under
	// `audit-performance-1788074814-dashboard-initial-data-still-exceeds-the-page-weight-budget`.
	const directory = `${type}-surface-${1788000000 + projectIndex * 1000 + index}-representative-record-title-for-payload-measurement`;
	const waiting = index % WAITING_EVERY === 0;
	return {
		completed: !waiting && index % 3 === 0,
		directory,
		id: directory,
		priority: index % 5,
		status: waiting ? 'waiting_approval' : index % 3 === 0 ? 'completed' : 'backlog',
		title: `Representative ${type} record ${index} for project ${projectIndex}`,
		type,
		updatedAt: '2026-08-29T12:00:00.000Z',
	};
}

/** Severity mix of a real audit backlog: the counts the Director ranks work by. */
const AUDIT_SEVERITIES = ['Critical', 'High', 'Medium', 'Low'] as const;

/**
 * The same records as `Feature` objects, which is what the Director's priority builder reads.
 *
 * `buildDirectorProjectPriority` summarises a backlog from `Feature[]`, not from the listing's
 * `featureStatus` rows, so the fleet-summary body can only be measured at this fleet's real volume
 * if both views describe the same 2,698 records.
 */
export function makeDashboardFeatures(project: ProjectSummaryDto): Feature[] {
	return project.featureStatus.map((entry, index) => {
		const feature: Feature = {
			category: entry.type === 'audit' ? 'Audit' : 'Core',
			dependencies: [],
			directory: entry.directory,
			id: entry.id,
			passes: entry.completed,
			// The listing DTO models both as nullable; a feature record leaves them off instead.
			priority: entry.priority ?? undefined,
			status: entry.status ?? undefined,
			title: entry.title,
		};
		if (entry.type === 'audit') {
			feature.auditSeverity = AUDIT_SEVERITIES[index % AUDIT_SEVERITIES.length];
			feature.auditSource = 'PERFORMANCE';
		}
		return feature;
	});
}

/**
 * The seven maturity stages in their canonical order (aidd-shared/metadata/maturity.ts).
 * The fixture needs the real ids because the endpoint's response schema pins them.
 */
const MATURITY_STAGES = [
	{ id: 'specified', label: 'Specified' },
	{ id: 'structured', label: 'Structured' },
	{ id: 'mapped', label: 'Mapped' },
	{ id: 'planned', label: 'Planned' },
	{ id: 'engaged', label: 'Engaged' },
	{ id: 'audited', label: 'Audited' },
	{ id: 'shipped', label: 'Shipped' },
] as const;

/**
 * A badge as the metadata reader produces one: a percentage, the stage it lands in, and a status
 * for every stage. Varied by project index so an ordering claim about the fleet has something to
 * order, and so the projection is not measured against 37 identical badges.
 */
function fleetMaturity(index: number) {
	const complete = index % (MATURITY_STAGES.length + 1);
	const current = MATURITY_STAGES[Math.min(complete, MATURITY_STAGES.length - 1)];
	return {
		currentStageId: current?.id ?? null,
		currentStageLabel: current?.label ?? null,
		nextArtifactLabel: complete < MATURITY_STAGES.length ? 'roadmap.json' : null,
		nextArtifactSlug: complete < MATURITY_STAGES.length ? 'roadmap.json' : null,
		percent: Math.round((complete / MATURITY_STAGES.length) * 100),
		stageStatuses: MATURITY_STAGES.map((stage, stageIndex) => ({
			id: stage.id,
			label: stage.label,
			status:
				stageIndex < complete ? 'complete' : stageIndex === complete ? 'partial' : 'empty',
		})),
	};
}

/**
 * Two runs and two iterations per project, complete enough for the shared activity derivation to
 * read them: it needs the counts, the feature lists and the commit total, not just the timestamps
 * the fleet summary reads. One iteration shares the newer run's id, which is the pair the
 * derivation collapses into a single entry.
 */
function fleetRuns(index: number) {
	const day = String(20 + (index % 8)).padStart(2, '0');
	return [
		{
			aiSummary: null,
			artifactWarnings: [],
			backend: 'claude-code',
			backendExitCode: 0,
			commitsCreated: [{ hash: 'a1b2c3d4e5f6', subject: 'feat: representative commit' }],
			commitsCreatedCount: 3,
			completedFeatures: ['representative-feature'],
			durationMs: 1_080_000,
			endedAt: `2026-08-${day}T11:58:00.000Z`,
			executionMode: null,
			exitCode: 0,
			filesCreated: 2,
			filesEdited: 9,
			mode: 'coding',
			model: 'claude-opus-5',
			phase: 'coding',
			provider: 'anthropic',
			reasoningEffort: 'high',
			residualDirtySourceFiles: [],
			residualUntrackedFeatureDirs: [],
			runId: `run-${index}-newer`,
			runLedgerDirty: false,
			scopeOverrun: false,
			source: 'cli',
			startedAt: `2026-08-${day}T11:40:00.000Z`,
			stopReason: 'completed',
			summary: null,
			triumvirateRoles: null,
		},
		{
			aiSummary: 'Reconciled the telemetry rollup with the run ledger.',
			artifactWarnings: [],
			backend: 'claude-code',
			backendExitCode: 1,
			commitsCreated: [],
			commitsCreatedCount: 0,
			completedFeatures: [],
			durationMs: 240_000,
			endedAt: `2026-08-${day}T09:04:00.000Z`,
			executionMode: null,
			exitCode: 1,
			filesCreated: 0,
			filesEdited: 1,
			mode: 'directive',
			model: 'claude-opus-5',
			phase: 'directive',
			provider: 'anthropic',
			reasoningEffort: null,
			residualDirtySourceFiles: [],
			residualUntrackedFeatureDirs: [],
			runId: `run-${index}-older`,
			runLedgerDirty: false,
			scopeOverrun: false,
			source: 'web',
			startedAt: `2026-08-${day}T09:00:00.000Z`,
			stopReason: 'failed',
			summary: null,
			triumvirateRoles: null,
		},
	];
}

function fleetIterations(index: number) {
	const day = String(20 + (index % 8)).padStart(2, '0');
	return [
		{
			backend: 'claude-code',
			completedFeatures: ['representative-feature'],
			completionMarkerIssue: null,
			durationMs: 1_020_000,
			endedAt: `2026-08-${day}T11:57:00.000Z`,
			executionMode: null,
			exitCode: 0,
			finalChecks: { build: 'passed', smokeQc: 'passed', typecheck: 'passed' },
			iteration: 1,
			// Same run as the newer entry above: the derivation keeps the run and drops this one.
			runId: `run-${index}-newer`,
			scopeOverrun: false,
			selectedFeatures: ['representative-feature'],
			startedAt: `2026-08-${day}T11:41:00.000Z`,
			status: 'success',
			summary: null,
			triumvirateRoles: null,
		},
		{
			backend: 'codex',
			completedFeatures: [],
			completionMarkerIssue: null,
			durationMs: 600_000,
			endedAt: `2026-08-${day}T07:10:00.000Z`,
			executionMode: null,
			exitCode: 0,
			finalChecks: { smokeQc: 'failed' },
			iteration: 2,
			runId: null,
			scopeOverrun: false,
			selectedFeatures: ['orphaned-iteration-feature'],
			startedAt: `2026-08-${day}T07:00:00.000Z`,
			status: 'no_work',
			summary: null,
			triumvirateRoles: null,
		},
	];
}

/** The listing metadata the fleet summary and the Director's work builder read past the projection. */
function fleetMetadataExtras(index: number) {
	return {
		// `latestFileBackedRunResult` folds the newest of these into each fleet row's lastRunResult.
		localIterations: fleetIterations(index),
		localRuns: fleetRuns(index),
		maturity: fleetMaturity(index),
		// The audit-policy bucket a local developer tool sits in: it is what decides whether the
		// Director files audit work at all, so it has to be a real bucket rather than a stub.
		profile: {
			authMode: 'local_owner',
			bucket: 'single_user_local',
			criticality: 'utility',
			dataSensitivity: 'low',
			deployment: 'local',
			derivesFromTemplate: 'spernakit',
			externalIntegrations: 'read_only',
			hasCliBinary: 'script_entry',
			publishesReleaseArchives: 'none',
			shipsContainerImage: 'none',
			source: 'explicit',
			updatedAt: '2026-08-29T12:00:00.000Z',
		},
	};
}

/**
 * A project as the listing cache holds it. Cast because only the fields the dashboard projection
 * reads are populated — `name`, `path`, `id`, `routeId`, `artifactHealth`, `featureStats`,
 * `featureSummary`, `featureStatus`, `priorityHealth` and `metadata.{artifactCheck, ports, roadmap,
 * sync}` — plus `phase` and the `metadata.{localRuns, localIterations, maturity, profile}` the
 * fleet-summary and priority builders read. The rest of `ProjectSummaryDto` is the bulk these
 * endpoints exist not to forward, and inventing values for it would measure the fixture rather
 * than the projection.
 */
export function makeDashboardProject(index: number, featureCount: number): ProjectSummaryDto {
	const featureStatus = Array.from({ length: featureCount }, (_unused, i) =>
		featureRecord(index, i),
	);
	const completed = featureStatus.filter((feature) => feature.completed).length;
	const waitingApproval = featureStatus.filter((f) => f.status === 'waiting_approval').length;
	const name = `representative-project-${String(index).padStart(2, '0')}`;
	return {
		artifactHealth: 'stale',
		featureStats: {
			closed: completed,
			dependencyBlocked: 0,
			failing: 0,
			open: featureCount - completed,
			passing: completed,
			total: featureCount,
			waitingApproval,
		},
		featureStatus,
		featureSummary: {
			audit: featureStatus.filter((f) => f.type === 'audit').length,
			completed,
			feature: featureStatus.filter((f) => f.type === 'feature').length,
			pending: featureCount - completed,
			remediation: featureStatus.filter((f) => f.type === 'remediation').length,
			total: featureCount,
		},
		id: `id-${name}`,
		metadata: {
			...fleetMetadataExtras(index),
			artifactCheck: {
				artifacts: [],
				checkedAt: '2026-08-29T12:00:00.000Z',
				staleThresholdDays: 30,
				summary: {
					fresh: 7,
					missing: 1,
					present: 9,
					requiredMissing: 0,
					stale: 2,
					total: 10,
				},
			},
			ports: { backendPort: 4000 + index, frontendPort: 5000 + index },
			roadmap: {
				currentMilestone: 'v1.0',
				invalidMappings: [],
				milestoneOrder: ['v1.0', 'v1.1', 'v1.2', 'v2.0', 'v2.1'],
				milestones: {
					'v1.0': { completed: 12, total: 12 },
					'v1.1': { completed: 3, total: 9 },
					'v1.2': { completed: 0, total: 6 },
					'v2.0': { completed: 0, total: 4 },
					'v2.1': { completed: 0, total: 2 },
				},
				unmappedFeatureDirectories: [],
			},
			sync: { lastSyncAt: null, lastSyncError: null, syncState: 'idle' },
		},
		name,
		path: `D:/applications/${name}`,
		phase: 'coding',
		priorityHealth: { band: index % 4 === 0 ? 'healthy' : 'audit_backlog', score: 60 + index },
		routeId: name,
	} as unknown as ProjectSummaryDto;
}

/** The 37 projects, with the 2,698 records spread across them as evenly as they divide. */
export function makeDashboardFleet(): ProjectSummaryDto[] {
	const base = Math.floor(DASHBOARD_FIXTURE_FEATURE_RECORDS / DASHBOARD_FIXTURE_PROJECT_COUNT);
	const remainder = DASHBOARD_FIXTURE_FEATURE_RECORDS - base * DASHBOARD_FIXTURE_PROJECT_COUNT;
	return Array.from({ length: DASHBOARD_FIXTURE_PROJECT_COUNT }, (_unused, index) =>
		makeDashboardProject(index, base + (index < remainder ? 1 : 0)),
	);
}

export function makeDashboardPortStatus(projects: ProjectSummaryDto[]): PortStatusMap {
	return Object.fromEntries(
		projects.map((project, index) => [
			project.id,
			{ backend: index % 3 === 0, frontend: index % 2 === 0 },
		]),
	);
}
