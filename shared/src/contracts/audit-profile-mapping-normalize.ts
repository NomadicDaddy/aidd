import type {
	ProjectAssuranceBucket,
	ProjectAuthMode,
	ProjectCliBinary,
	ProjectContainerImage,
	ProjectCriticality,
	ProjectDataSensitivity,
	ProjectDeployment,
	ProjectExternalIntegrations,
	ProjectReleaseArtifacts,
	ProjectTemplateOrigin,
} from './project-profile.ts';

import {
	isAuditOverrideEffect,
	matchFacetKeys,
	matchFacetSets,
} from './audit-profile-mapping-facets.ts';
import {
	type AuditOverrideEffect,
	auditOverrideEffectValues,
	type AuditProfileMapping,
	type AuditProfileMatch,
	type AuditProfileOverrides,
	type AuditProfileRule,
} from './audit-profile-mapping-types.ts';

function ensureObject(value: unknown, label: string): Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new Error(`${label} must be an object.`);
	}
	return value as Record<string, unknown>;
}

function ensureStringArray(value: unknown, label: string): string[] {
	if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
	const result: string[] = [];
	for (const entry of value) {
		if (typeof entry !== 'string' || entry.length === 0) {
			throw new Error(`${label} entries must be non-empty strings.`);
		}
		result.push(entry);
	}
	return result;
}

function normalizeMatch(raw: unknown, ruleId: string): AuditProfileMatch {
	const match = ensureObject(raw, `Rule ${ruleId} match`);
	const result: AuditProfileMatch = {};
	for (const key of Object.keys(match)) {
		if (!(key in matchFacetSets)) {
			throw new Error(`Rule ${ruleId} match has unknown facet: ${key}`);
		}
	}
	for (const facet of matchFacetKeys) {
		const value = match[facet];
		if (value === undefined) continue;
		const values = ensureStringArray(value, `Rule ${ruleId} match.${facet}`);
		const allowed = matchFacetSets[facet];
		for (const candidate of values) {
			if (!allowed.has(candidate)) {
				throw new Error(`Rule ${ruleId} match.${facet} has invalid value: ${candidate}`);
			}
		}
		setMatchFacet(result, facet, values);
	}
	return result;
}

/**
 * Every case narrows `values` to the facet's own union. The casts are safe because
 * `normalizeMatch` has already rejected any entry outside `matchFacetSets[facet]`, which is built
 * from the same value list the union is; the compiler cannot see that check across the call.
 *
 * The `never` binding after the switch is the enforcement: adding a facet to `AuditProfileMatch`
 * (which `matchFacetSets` is keyed by, so a new facet cannot be declared without it) widens
 * `facet` past `never` and fails to compile until a case carries it. Without that, a new facet
 * would be validated by `normalizeMatch` and then dropped here, and a rule naming only that facet
 * would normalize to an empty match — which `matchesProfile` reads as "applies to everything".
 */
function setMatchFacet(
	target: AuditProfileMatch,
	facet: keyof AuditProfileMatch,
	values: string[],
): void {
	switch (facet) {
		case 'authMode':
			target.authMode = values as ProjectAuthMode[];
			return;
		case 'bucket':
			target.bucket = values as ProjectAssuranceBucket[];
			return;
		case 'criticality':
			target.criticality = values as ProjectCriticality[];
			return;
		case 'dataSensitivity':
			target.dataSensitivity = values as ProjectDataSensitivity[];
			return;
		case 'deployment':
			target.deployment = values as ProjectDeployment[];
			return;
		case 'derivesFromTemplate':
			target.derivesFromTemplate = values as ProjectTemplateOrigin[];
			return;
		case 'externalIntegrations':
			target.externalIntegrations = values as ProjectExternalIntegrations[];
			return;
		case 'hasCliBinary':
			target.hasCliBinary = values as ProjectCliBinary[];
			return;
		case 'publishesReleaseArchives':
			target.publishesReleaseArchives = values as ProjectReleaseArtifacts[];
			return;
		case 'shipsContainerImage':
			target.shipsContainerImage = values as ProjectContainerImage[];
			return;
	}
	const unhandled: never = facet;
	throw new Error(`Unhandled audit profile match facet: ${String(unhandled)}`);
}

function normalizeRule(raw: unknown): AuditProfileRule {
	const rule = ensureObject(raw, 'Rule');
	if (typeof rule.id !== 'string' || rule.id.length === 0) {
		throw new Error('Rule.id must be a non-empty string.');
	}
	const id = rule.id;
	if (rule.description !== undefined && typeof rule.description !== 'string') {
		throw new Error(`Rule ${id} description must be a string.`);
	}
	if (!isAuditOverrideEffect(rule.effect)) {
		throw new Error(
			`Rule ${id} effect must be one of: ${auditOverrideEffectValues.join(', ')}`,
		);
	}
	const audits = ensureStringArray(rule.audits, `Rule ${id} audits`);
	if (audits.length === 0) throw new Error(`Rule ${id} audits must not be empty.`);
	const match = normalizeMatch(rule.match, id);
	const result: AuditProfileRule = {
		audits,
		effect: rule.effect,
		id,
		match,
	};
	if (typeof rule.description === 'string') result.description = rule.description;
	return result;
}

export function normalizeAuditProfileMapping(value: unknown): AuditProfileMapping {
	const raw = ensureObject(value, 'Audit profile mapping');
	if (raw.version !== 1) throw new Error('Audit profile mapping version must be 1.');
	if (!Array.isArray(raw.rules)) throw new Error('Audit profile mapping rules must be an array.');
	const rules: AuditProfileRule[] = [];
	const seenIds = new Set<string>();
	for (const rawRule of raw.rules) {
		const rule = normalizeRule(rawRule);
		if (seenIds.has(rule.id)) {
			throw new Error(`Duplicate rule id: ${rule.id}`);
		}
		seenIds.add(rule.id);
		rules.push(rule);
	}
	const result: AuditProfileMapping = { rules, version: 1 };
	if (typeof raw.$schema === 'string') result.$schema = raw.$schema;
	if (raw.requiresPackages !== undefined) {
		result.requiresPackages = normalizeRequiresPackages(raw.requiresPackages);
	}
	return result;
}

function normalizeRequiresPackages(value: unknown): Record<string, string[]> {
	const table = ensureObject(value, 'Audit profile mapping requiresPackages');
	const result: Record<string, string[]> = {};
	for (const [auditName, packages] of Object.entries(table)) {
		const names = ensureStringArray(packages, `requiresPackages.${auditName}`);
		// An empty list would make the audit apply nowhere, which is what `excluded` is for.
		if (names.length === 0) {
			throw new Error(`requiresPackages.${auditName} must name at least one package.`);
		}
		result[auditName.toUpperCase()] = names;
	}
	return result;
}

export function normalizeAuditProfileOverrides(value: unknown): AuditProfileOverrides {
	const raw = ensureObject(value, 'Audit profile overrides');
	if (raw.version !== 1) throw new Error('Audit profile overrides version must be 1.');
	if (typeof raw.updatedAt !== 'string') {
		throw new Error('Audit profile overrides updatedAt must be an ISO timestamp.');
	}
	const auditsRaw = ensureObject(raw.audits ?? {}, 'Audit profile overrides.audits');
	const audits: Record<string, AuditOverrideEffect> = {};
	for (const [name, effect] of Object.entries(auditsRaw)) {
		if (!isAuditOverrideEffect(effect)) {
			throw new Error(
				`Audit profile overrides.audits.${name} must be one of: ${auditOverrideEffectValues.join(', ')}`,
			);
		}
		audits[name] = effect;
	}
	if (!Array.isArray(raw.rules ?? [])) {
		throw new Error('Audit profile overrides.rules must be an array.');
	}
	const rules: AuditProfileRule[] = [];
	const seenIds = new Set<string>();
	for (const rawRule of (raw.rules as unknown[]) ?? []) {
		const rule = normalizeRule(rawRule);
		if (seenIds.has(rule.id)) {
			throw new Error(`Duplicate override rule id: ${rule.id}`);
		}
		seenIds.add(rule.id);
		rules.push(rule);
	}
	const result: AuditProfileOverrides = {
		audits,
		rules,
		updatedAt: raw.updatedAt,
		version: 1,
	};
	if (typeof raw.$schema === 'string') result.$schema = raw.$schema;
	return result;
}
