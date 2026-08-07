import {
	type AuditProfileMapping,
	type AuditProfileOverrides,
	isAuditApplicableToProfile,
} from 'aidd-shared';
import { createAuditFreshnessContext } from 'aidd-shared/metadata/audit-freshness';
import {
	loadAuditProfileMapping,
	loadAuditProfileOverrides,
} from 'aidd-shared/metadata/audit-profile-mapping';
import { MATURITY_INVOCATIONS, MATURITY_STAGES } from 'aidd-shared/metadata/maturity';

import type {
	MaturityArtifactDto,
	MaturityArtifactStatus,
	MaturityAuditEntryDto,
	MaturityBadgeDto,
	MaturityDto,
	MaturityNextActionDto,
	MaturityStageDto,
	MaturityStageId,
	MaturityStageStatus,
} from '../../types.ts';
import type { MaturityComputeInput } from './artifactClassification.ts';

import {
	classifyArtifact,
	classifyAuditEntry,
	loadMaturitySkip,
} from './artifactClassification.ts';

function countsAsComplete(status: MaturityArtifactStatus): boolean {
	return status === 'fresh' || status === 'stale' || status === 'skipped';
}

function classifyStageStatus(artifacts: MaturityArtifactDto[]): MaturityStageStatus {
	const required = artifacts.filter((a) => a.required);
	if (required.length === 0) return 'complete';
	const presentCount = required.filter((a) => countsAsComplete(a.status)).length;
	if (presentCount === required.length) return 'complete';
	if (presentCount === 0) return 'empty';
	return 'partial';
}

function buildNextAction(
	stage: MaturityStageDto,
	auditEntries: MaturityAuditEntryDto[],
): MaturityNextActionDto | null {
	if (stage.id === 'audited') {
		const target =
			auditEntries.find((entry) => !entry.skipped && entry.freshness === 'missing') ??
			auditEntries.find((entry) => !entry.skipped && entry.freshness === 'stale');
		if (!target) return null;
		return {
			auditName: target.auditName,
			invocation: 'audit',
			slug: `audit:${target.auditName}`,
			stageId: stage.id,
		};
	}
	const target =
		stage.artifacts.find((a) => a.required && a.status === 'missing') ??
		stage.artifacts.find((a) => a.required && a.status === 'stale');
	if (!target) return null;
	const definition = MATURITY_INVOCATIONS[target.slug];
	if (!definition) {
		return {
			invocation: 'manual',
			slug: target.slug,
			stageId: stage.id,
		};
	}
	switch (definition.kind) {
		case 'audit':
			return {
				invocation: 'audit',
				slug: target.slug,
				stageId: stage.id,
			};
		case 'feature':
			return {
				invocation: 'feature',
				slug: target.slug,
				stageId: stage.id,
			};
		case 'manual':
			return {
				hint: definition.hint,
				invocation: 'manual',
				slug: target.slug,
				stageId: stage.id,
				target: definition.target,
			};
		case 'profile':
			return {
				hint: 'Create .aidd/project-profile.json from the inferred project profile.',
				invocation: 'profile',
				slug: target.slug,
				stageId: stage.id,
			};
		case 'skill':
			return {
				command: `${definition.skillId}${definition.args ? ` ${definition.args}` : ''}`,
				invocation: 'skill',
				...(definition.args ? { args: definition.args } : {}),
				...(definition.postScript ? { postScript: definition.postScript } : {}),
				skillId: definition.skillId,
				slug: target.slug,
				stageId: stage.id,
			};
	}
}

import type { ProjectAssuranceProfile } from 'aidd-shared';

// Deploy config is only meaningful evidence when the profile says the app
// leaves the local machine — mirrors how audit applicability filters the
// audited stage. A local-only project still ships via runbook + release tag.
function shippedArtifactApplies(slug: string, profile: ProjectAssuranceProfile): boolean {
	if (slug !== 'deploy-config') return true;
	return profile.deployment !== 'local';
}

function bucketLabel(bucket: ProjectAssuranceProfile['bucket']): string {
	switch (bucket) {
		case 'critical_regulated':
			return 'Critical';
		case 'internet_single_org':
			return 'Internet org';
		case 'multi_user_local':
			return 'Multi-user local';
		case 'private_team':
			return 'Private team';
		case 'prototype_archive':
			return 'Archive';
		case 'public_multi_tenant':
			return 'Multi-tenant';
		case 'single_user_local':
			return 'Single-user local';
		default:
			return bucket;
	}
}

export async function computeMaturity(input: MaturityComputeInput): Promise<MaturityDto> {
	const skip = new Set(await loadMaturitySkip(input.projectDir));
	const stages: MaturityStageDto[] = [];
	const auditEntries: MaturityAuditEntryDto[] = [];
	const auditProfileMapping: AuditProfileMapping = await loadAuditProfileMapping(
		input.auditCatalogDir,
	);
	const auditProfileOverrides: AuditProfileOverrides | null = await loadAuditProfileOverrides(
		input.projectDir,
	);
	const auditFreshnessContext = input.auditFreshnessContext ?? createAuditFreshnessContext();
	for (const stageDef of MATURITY_STAGES) {
		const artifacts: MaturityArtifactDto[] = [];
		if (stageDef.id === 'audited') {
			const applicable = input.auditCatalogNames.filter((name) =>
				isAuditApplicableToProfile(
					input.profile,
					name,
					auditProfileMapping,
					auditProfileOverrides,
				),
			);
			// Classify concurrently. Each audit's freshness check spawns `git log --numstat`
			// from that report's recorded head, and awaiting them one at a time serialised
			// every one of those subprocesses: 39 audits resolved to 8 distinct git
			// invocations totalling ~700 ms of the endpoint's ~1.0 s, two of them ~295 ms
			// apiece because they walk 266 commits. Run concurrently they cost about as much
			// as the slowest one. The numstat cache in AuditFreshnessContext stores promises
			// rather than values, so concurrent callers with identical arguments still share
			// a single subprocess instead of racing to spawn duplicates. Promise.all
			// preserves input order, so the artifact and entry lists are unchanged.
			const classifications = await Promise.all(
				applicable.map((auditName) =>
					classifyAuditEntry(
						auditName,
						input.projectDir,
						skip,
						input.latestProjectAuditRun,
						auditFreshnessContext,
					),
				),
			);
			for (const classification of classifications) {
				artifacts.push(classification.artifact);
				auditEntries.push(classification.entry);
			}
		} else {
			const applicableArtifacts =
				stageDef.id === 'shipped'
					? stageDef.artifacts.filter((ref) =>
							shippedArtifactApplies(ref.slug, input.profile),
						)
					: stageDef.artifacts;
			for (const artifactRef of applicableArtifacts) {
				const classified = await classifyArtifact(artifactRef, input, skip);
				artifacts.push({
					kind: artifactRef.kind,
					label: artifactRef.label,
					mtime: classified.mtime,
					required: artifactRef.required,
					slug: artifactRef.slug,
					status: classified.status,
				});
			}
		}
		const status = classifyStageStatus(artifacts);
		const required = artifacts.filter((a) => a.required).length;
		const complete = artifacts.filter((a) => a.required && countsAsComplete(a.status)).length;
		stages.push({
			artifacts,
			complete,
			description: stageDef.description,
			id: stageDef.id,
			label: stageDef.label,
			order: stageDef.order,
			required,
			status,
		});
	}
	const firstIncomplete = stages.find((s) => s.status !== 'complete');
	const currentStage = firstIncomplete ?? null;
	const totalRequired = stages.reduce((acc, s) => acc + s.required, 0);
	const totalComplete = stages.reduce((acc, s) => acc + s.complete, 0);
	const percent = totalRequired === 0 ? 100 : Math.round((totalComplete / totalRequired) * 100);
	const nextAction = currentStage ? buildNextAction(currentStage, auditEntries) : null;
	const nextArtifact =
		currentStage?.artifacts.find((a) => a.required && a.status === 'missing') ??
		currentStage?.artifacts.find((a) => a.required && a.status === 'stale') ??
		null;
	const stageStatuses: MaturityBadgeDto['stageStatuses'] = stages.map((stage) => ({
		id: stage.id,
		label: stage.label,
		status: stage.status,
	}));
	return {
		auditProfileBucket: input.profile.bucket,
		auditProfileLabel: bucketLabel(input.profile.bucket),
		currentStageId: (currentStage?.id ?? null) as MaturityStageId | null,
		currentStageLabel: currentStage?.label ?? null,
		nextAction,
		nextArtifactLabel: nextArtifact?.label ?? null,
		nextArtifactSlug: nextArtifact?.slug ?? null,
		percent,
		skip: [...skip],
		stages,
		stageStatuses,
	};
}

export function toMaturityBadge(detail: MaturityDto): MaturityBadgeDto {
	return {
		currentStageId: detail.currentStageId,
		currentStageLabel: detail.currentStageLabel,
		nextArtifactLabel: detail.nextArtifactLabel,
		nextArtifactSlug: detail.nextArtifactSlug,
		percent: detail.percent,
		stageStatuses: detail.stageStatuses,
	};
}
