import type { ProjectAssuranceBucket, ProjectAssuranceProfile } from './project-profile.ts';

import { matchFacetKeys } from './audit-profile-mapping-facets.ts';
import {
	type AuditApplicabilityCell,
	type AuditApplicabilityRow,
	type AuditApplicabilitySource,
	type AuditEffect,
	type AuditOverrideEffect,
	type AuditProfileMapping,
	type AuditProfileMatch,
	type AuditProfileOverrides,
	type AuditProfileRule,
	auditWildcard,
} from './audit-profile-mapping-types.ts';
import { projectAssuranceBuckets } from './project-profile.ts';

function matchesProfile(profile: ProjectAssuranceProfile, match: AuditProfileMatch): boolean {
	for (const facet of matchFacetKeys) {
		const allowed = match[facet];
		if (allowed === undefined) continue;
		const profileValue = profile[facet];
		if (typeof profileValue !== 'string') return false;
		if (!(allowed as string[]).includes(profileValue)) return false;
	}
	return true;
}

function ruleTargetsAudit(rule: AuditProfileRule, normalizedAuditName: string): boolean {
	for (const candidate of rule.audits) {
		if (candidate === auditWildcard) return true;
		if (candidate.toUpperCase() === normalizedAuditName) return true;
	}
	return false;
}

function ruleNamesAuditExplicitly(rule: AuditProfileRule, normalizedAuditName: string): boolean {
	for (const candidate of rule.audits) {
		if (candidate === auditWildcard) continue;
		if (candidate.toUpperCase() === normalizedAuditName) return true;
	}
	return false;
}

interface LayerOutcome {
	conditional: boolean;
	effect: AuditOverrideEffect;
	explicit: boolean;
	ruleId: string;
}

function resolveLayer(
	profile: ProjectAssuranceProfile,
	normalizedAuditName: string,
	rules: AuditProfileRule[],
): LayerOutcome | null {
	return pickLayerOutcome(rules, (rule) => {
		if (!ruleTargetsAudit(rule, normalizedAuditName)) return null;
		if (!matchesProfile(profile, rule.match)) return null;
		return {
			conditional: false,
			explicit: ruleNamesAuditExplicitly(rule, normalizedAuditName),
		};
	});
}

function resolveBucketLayer(
	bucket: ProjectAssuranceBucket,
	normalizedAuditName: string,
	rules: AuditProfileRule[],
): LayerOutcome | null {
	return pickLayerOutcome(rules, (rule) => {
		if (!ruleTargetsAudit(rule, normalizedAuditName)) return null;
		if (!bucketPermitsRule(bucket, rule.match)) return null;
		return {
			conditional: hasNonBucketFacets(rule.match),
			explicit: ruleNamesAuditExplicitly(rule, normalizedAuditName),
		};
	});
}

function pickLayerOutcome(
	rules: AuditProfileRule[],
	classify: (rule: AuditProfileRule) => { conditional: boolean; explicit: boolean } | null,
): LayerOutcome | null {
	let excluded: LayerOutcome | null = null;
	let required: LayerOutcome | null = null;
	let disabled: LayerOutcome | null = null;
	for (const rule of rules) {
		const classification = classify(rule);
		if (!classification) continue;
		const outcome: LayerOutcome = {
			conditional: classification.conditional,
			effect: rule.effect,
			explicit: classification.explicit,
			ruleId: rule.id,
		};
		if (rule.effect === 'excluded' && !excluded) excluded = outcome;
		else if (rule.effect === 'required' && !required) required = outcome;
		else if (rule.effect === 'disabled' && !disabled) disabled = outcome;
	}
	if (excluded) {
		if (required && required.explicit && !excluded.explicit) return required;
		return excluded;
	}
	if (required) return required;
	if (disabled) return disabled;
	return null;
}

function bucketPermitsRule(bucket: ProjectAssuranceBucket, match: AuditProfileMatch): boolean {
	return match.bucket === undefined || match.bucket.includes(bucket);
}

function hasNonBucketFacets(match: AuditProfileMatch): boolean {
	for (const key of matchFacetKeys) {
		if (key === 'bucket') continue;
		if (match[key] !== undefined) return true;
	}
	return false;
}

export function resolveAuditEffect(
	profile: ProjectAssuranceProfile,
	auditName: string,
	mapping: AuditProfileMapping,
	overrides?: AuditProfileOverrides | null,
): AuditApplicabilityCell {
	const normalized = auditName.toUpperCase();
	if (overrides) {
		const explicit = overrides.audits[normalized] ?? overrides.audits[auditName];
		if (explicit !== undefined) {
			return {
				applies: explicit === 'required',
				effect: explicit,
				source: 'override-explicit',
			};
		}
		const overrideLayer = resolveLayer(profile, normalized, overrides.rules);
		if (overrideLayer) {
			return {
				applies: overrideLayer.effect === 'required',
				effect: overrideLayer.effect,
				ruleId: overrideLayer.ruleId,
				source: 'override-rule',
			};
		}
	}
	const globalLayer = resolveLayer(profile, normalized, mapping.rules);
	if (globalLayer) {
		return {
			applies: globalLayer.effect === 'required',
			effect: globalLayer.effect,
			ruleId: globalLayer.ruleId,
			source: 'global-rule',
		};
	}
	return { applies: true, effect: 'default', source: 'default' };
}

export function isAuditApplicableToProfile(
	profile: ProjectAssuranceProfile,
	auditName: string,
	mapping: AuditProfileMapping,
	overrides?: AuditProfileOverrides | null,
): boolean {
	return resolveAuditEffect(profile, auditName, mapping, overrides).applies;
}

export function resolveBucketAuditEffect(
	bucket: ProjectAssuranceBucket,
	auditName: string,
	mapping: AuditProfileMapping,
	overrides?: AuditProfileOverrides | null,
): AuditApplicabilityCell {
	const normalized = auditName.toUpperCase();
	if (overrides) {
		const explicit = overrides.audits[normalized] ?? overrides.audits[auditName];
		if (explicit !== undefined) {
			return {
				applies: cellApplies(explicit, false),
				effect: explicit,
				source: 'override-explicit',
			};
		}
		const overrideLayer = resolveBucketLayer(bucket, normalized, overrides.rules);
		if (overrideLayer) return layerToCell(overrideLayer, 'override-rule');
	}
	const globalLayer = resolveBucketLayer(bucket, normalized, mapping.rules);
	if (globalLayer) return layerToCell(globalLayer, 'global-rule');
	return { applies: true, effect: 'default', source: 'default' };
}

function layerToCell(
	layer: LayerOutcome,
	source: AuditApplicabilitySource,
): AuditApplicabilityCell {
	const cell: AuditApplicabilityCell = {
		applies: cellApplies(layer.effect, layer.conditional),
		effect: layer.effect,
		ruleId: layer.ruleId,
		source,
	};
	if (layer.conditional) cell.conditional = true;
	return cell;
}

function cellApplies(effect: AuditEffect, conditional: boolean): boolean {
	if (effect === 'default' || effect === 'required') return true;
	return conditional;
}

export function buildApplicabilityMatrix(
	auditNames: string[],
	mapping: AuditProfileMapping,
	overrides?: AuditProfileOverrides | null,
): AuditApplicabilityRow[] {
	const rows: AuditApplicabilityRow[] = [];
	for (const auditName of auditNames) {
		const byBucket = {} as Record<ProjectAssuranceBucket, AuditApplicabilityCell>;
		for (const bucket of projectAssuranceBuckets) {
			byBucket[bucket] = resolveBucketAuditEffect(bucket, auditName, mapping, overrides);
		}
		rows.push({ auditName, byBucket });
	}
	return rows;
}

export function requiresFullHardening(profile: ProjectAssuranceProfile): boolean {
	return (
		profile.bucket === 'public_multi_tenant' ||
		profile.bucket === 'critical_regulated' ||
		profile.dataSensitivity === 'regulated' ||
		profile.deployment === 'public_server' ||
		profile.deployment === 'cloud' ||
		profile.externalIntegrations === 'financial_or_security' ||
		profile.criticality === 'business_critical'
	);
}

export function isLowExposureLocalProfile(profile: ProjectAssuranceProfile): boolean {
	return (
		profile.bucket === 'single_user_local' &&
		profile.deployment === 'local' &&
		(profile.dataSensitivity === 'none' || profile.dataSensitivity === 'low') &&
		(profile.externalIntegrations === 'none' || profile.externalIntegrations === 'read_only') &&
		(profile.criticality === 'toy' || profile.criticality === 'utility')
	);
}
