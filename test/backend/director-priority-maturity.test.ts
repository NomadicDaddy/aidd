import { describe, expect, test } from 'bun:test';
import type { ProjectAssuranceProfile } from 'aidd-shared';
import { buildProjectWork } from '../../backend/src/services/director/priority/workBuilder.ts';
import type {
	DirectorAuditHealth,
	DirectorBacklogBreakdown,
} from '../../backend/src/services/director/priority/types.ts';
import type { MaturityStageId } from '../../backend/src/types/maturity.ts';
import type { ProjectSummaryDto } from '../../backend/src/types/project.ts';

const fullHardeningProfile: ProjectAssuranceProfile = {
	authMode: 'tenant_rbac',
	bucket: 'public_multi_tenant',
	criticality: 'business_critical',
	dataSensitivity: 'regulated',
	deployment: 'cloud',
	externalIntegrations: 'financial_or_security',
	source: 'explicit',
	updatedAt: '2026-01-01T00:00:00.000Z',
};

const lowExposureProfile: ProjectAssuranceProfile = {
	authMode: 'local_owner',
	bucket: 'single_user_local',
	criticality: 'utility',
	dataSensitivity: 'low',
	deployment: 'local',
	externalIntegrations: 'none',
	source: 'explicit',
	updatedAt: '2026-01-01T00:00:00.000Z',
};

// buildProjectWork only reads project.name, project.artifactHealth,
// project.metadata.{artifactCheck, profile, maturity.currentStageId}. A healthy
// artifact check keeps the artifact_maintenance work item out of the results so the
// audit/feature items under test are isolated.
function makeProject(options: {
	featureTotal?: number;
	phase?: 'coding' | 'initializer' | 'onboarding';
	profile: ProjectAssuranceProfile;
	stage: MaturityStageId | null;
}): ProjectSummaryDto {
	return {
		artifactHealth: 'fresh',
		featureStats: {
			closed: 0,
			failing: 0,
			open: 0,
			passing: 0,
			total: options.featureTotal ?? 0,
			waitingApproval: 0,
		},
		phase: options.phase ?? 'coding',
		metadata: {
			artifactCheck: {
				artifacts: [],
				checkedAt: '2026-01-01T00:00:00.000Z',
				staleThresholdDays: 30,
				summary: {
					fresh: 0,
					missing: 0,
					present: 0,
					requiredMissing: 0,
					stale: 0,
					total: 0,
				},
			},
			maturity: {
				currentStageId: options.stage,
				currentStageLabel: options.stage,
				nextArtifactLabel: null,
				nextArtifactSlug: null,
				percent: 0,
				stageStatuses: [],
			},
			profile: options.profile,
		},
		name: 'test-project',
	} as unknown as ProjectSummaryDto;
}

function makeBacklog(
	overrides: Partial<{
		audit: DirectorBacklogBreakdown['audit'];
		feature: DirectorBacklogBreakdown['feature'];
		remediation: DirectorBacklogBreakdown['remediation'];
	}> = {}
): DirectorBacklogBreakdown {
	return {
		audit: { bySeverity: {}, count: 0, top: [] },
		feature: { blockedCount: 0, count: 0, readyCount: 0, top: [] },
		remediation: { count: 0, top: [] },
		...overrides,
	};
}

const emptyAuditHealth: DirectorAuditHealth = {
	checkedAt: '2026-01-01T00:00:00.000Z',
	fresh: [],
	missing: [],
	stale: [],
	staleThresholdDays: 30,
};

function auditBacklogItem(project: ProjectSummaryDto, bySeverity: Record<string, number>) {
	const backlog = makeBacklog({
		audit: { bySeverity, count: 1, top: [] },
	});
	const work = buildProjectWork(project, backlog, emptyAuditHealth, true);
	return work.find((item) => item.taskType === 'audit_backlog');
}

describe('director onboarding intake suggestion', () => {
	test('an un-analyzed onboarding project (no features) gets a project_intake nudge', () => {
		const project = makeProject({
			featureTotal: 0,
			phase: 'onboarding',
			profile: fullHardeningProfile,
			stage: 'specified',
		});
		const work = buildProjectWork(project, makeBacklog(), emptyAuditHealth, true);

		expect(work).toHaveLength(1);
		expect(work[0]?.taskType).toBe('project_intake');
		expect(work[0]?.suggestedRecipe).toBe('project-intake');
	});

	test('intake is additive: it does not preempt audit work for an onboarding project', () => {
		const project = makeProject({
			featureTotal: 0,
			phase: 'onboarding',
			profile: fullHardeningProfile,
			stage: 'specified',
		});
		// An onboarding project that also has an audit backlog gets both items, with the
		// established audit work sorted ahead of the intake nudge.
		const work = buildProjectWork(
			project,
			makeBacklog({ audit: { bySeverity: { high: 1 }, count: 1, top: [] } }),
			emptyAuditHealth,
			true
		);
		const types = work.map((item) => item.taskType);
		expect(types).toContain('project_intake');
		expect(types).toContain('audit_backlog');
		expect(types.indexOf('audit_backlog')).toBeLessThan(types.indexOf('project_intake'));
	});

	test('an onboarding project that already has features gets no intake nudge', () => {
		const project = makeProject({
			featureTotal: 5,
			phase: 'onboarding',
			profile: fullHardeningProfile,
			stage: 'specified',
		});
		const work = buildProjectWork(project, makeBacklog(), emptyAuditHealth, true);
		expect(work.some((item) => item.taskType === 'project_intake')).toBe(false);
	});

	test('a coding-phase project does not surface a project_intake item', () => {
		const project = makeProject({
			phase: 'coding',
			profile: fullHardeningProfile,
			stage: 'specified',
		});
		const work = buildProjectWork(project, makeBacklog(), emptyAuditHealth, true);
		expect(work.some((item) => item.taskType === 'project_intake')).toBe(false);
	});
});

describe('director audit-work maturity deferral', () => {
	test('caps a HIGH full-hardening audit backlog to MEDIUM while immature', () => {
		const project = makeProject({ profile: fullHardeningProfile, stage: 'specified' });
		const item = auditBacklogItem(project, { high: 1 });

		expect(item?.riskLevel).toBe('MEDIUM');
		expect(item?.evidence.profileAdjustment).toBe(
			'escalated_full_hardening+deferred_premature_maturity'
		);
		expect(item?.evidence.maturityDeferred).toBe(true);
		expect(item?.evidence.maturityStage).toBe('specified');
		expect(item?.reason).toContain("below the 'engaged' maturity stage");
		// Deferral never hides surfaced work — the item is still present.
		expect(item).toBeDefined();
	});

	test('leaves a HIGH full-hardening audit backlog at HIGH once engaged', () => {
		const project = makeProject({ profile: fullHardeningProfile, stage: 'engaged' });
		const item = auditBacklogItem(project, { high: 1 });

		expect(item?.riskLevel).toBe('HIGH');
		expect(item?.evidence.profileAdjustment).toBe('escalated_full_hardening');
		expect(item?.evidence.maturityDeferred).toBe(false);
	});

	test('treats a null maturity stage as the most immature state', () => {
		const project = makeProject({ profile: fullHardeningProfile, stage: null });
		const item = auditBacklogItem(project, { high: 1 });

		expect(item?.riskLevel).toBe('MEDIUM');
		expect(item?.evidence.maturityDeferred).toBe(true);
		expect(item?.evidence.maturityStage).toBeNull();
	});

	test("'planned' is below the gate but 'engaged' is not", () => {
		const planned = auditBacklogItem(
			makeProject({ profile: fullHardeningProfile, stage: 'planned' }),
			{ high: 1 }
		);
		const engaged = auditBacklogItem(
			makeProject({ profile: fullHardeningProfile, stage: 'engaged' }),
			{ high: 1 }
		);

		expect(planned?.evidence.maturityDeferred).toBe(true);
		expect(planned?.riskLevel).toBe('MEDIUM');
		expect(engaged?.evidence.maturityDeferred).toBe(false);
		expect(engaged?.riskLevel).toBe('HIGH');
	});

	test('does not lower an already-MEDIUM low-exposure audit backlog (cap, not floor)', () => {
		// single_user_local + high severity => base risk MEDIUM via local_high_downgraded.
		const project = makeProject({ profile: lowExposureProfile, stage: 'specified' });
		const item = auditBacklogItem(project, { high: 1 });

		expect(item?.riskLevel).toBe('MEDIUM');
		expect(item?.evidence.profileAdjustment).toBe(
			'local_high_downgraded+deferred_premature_maturity'
		);
	});

	test('does not defer non-audit work (feature backlog) for immature projects', () => {
		const project = makeProject({ profile: fullHardeningProfile, stage: 'specified' });
		const backlog = makeBacklog({
			feature: { blockedCount: 0, count: 1, readyCount: 1, top: [] },
		});
		const work = buildProjectWork(project, backlog, emptyAuditHealth, true);
		const feature = work.find((item) => item.taskType === 'feature_completion');

		expect(feature).toBeDefined();
		expect(feature?.evidence.maturityDeferred).toBeUndefined();
		expect(feature?.reason).not.toContain('maturity stage');
	});

	test('defers audit maintenance work while immature', () => {
		const project = makeProject({ profile: fullHardeningProfile, stage: 'mapped' });
		const auditHealth: DirectorAuditHealth = {
			...emptyAuditHealth,
			missing: ['SECURITY', 'DEVOPS'],
		};
		const work = buildProjectWork(project, makeBacklog(), auditHealth, true);
		const maintenance = work.find((item) => item.taskType === 'audit_maintenance');

		expect(maintenance?.evidence.maturityDeferred).toBe(true);
		expect(maintenance?.evidence.profileAdjustment).toContain('deferred_premature_maturity');
	});
});
