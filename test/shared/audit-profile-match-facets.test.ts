import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import {
	matchFacetKeys,
	matchFacetSets,
} from '../../shared/src/contracts/audit-profile-mapping-facets.ts';
import {
	normalizeAuditProfileMapping,
	resolveAuditEffect,
} from '../../shared/src/contracts/audit-profile-mapping.ts';
import type { AuditProfileMatch } from '../../shared/src/contracts/audit-profile-mapping-types.ts';
import type { ProjectAssuranceProfile } from '../../shared/src/contracts/project-profile.ts';
import { loadAuditProfileMapping } from '../../shared/src/metadata/audit-profile-mapping.ts';

type Facet = keyof AuditProfileMatch;

const repoRoot = join(import.meta.dir, '..', '..');
const auditName = 'FACET_PROBE';

function facetValues(facet: Facet): string[] {
	const values = [...matchFacetSets[facet]];
	if (values.length < 2) {
		throw new Error(
			`Facet ${facet} needs two values to test rejection; it declares ${values.length}.`,
		);
	}
	return values;
}

/**
 * Built by enumerating `matchFacetKeys` so a new facet is covered without editing this file. The
 * cast is safe because every profile facet field is exactly the enum `matchFacetSets[facet]` holds.
 */
function profileWith(overrides: Partial<Record<Facet, string>>): ProjectAssuranceProfile {
	const fields: Record<string, string> = {
		source: 'explicit',
		updatedAt: '2026-01-01T00:00:00.000Z',
	};
	for (const facet of matchFacetKeys) fields[facet] = facetValues(facet)[0] as string;
	return { ...fields, ...overrides } as unknown as ProjectAssuranceProfile;
}

function mappingWithMatch(match: Record<string, string[]>) {
	return normalizeAuditProfileMapping({
		rules: [{ audits: [auditName], effect: 'excluded', id: 'facet-probe', match }],
		version: 1,
	});
}

describe('audit profile match facets', () => {
	test('declares a facet set for every facet on AuditProfileMatch', () => {
		expect(matchFacetKeys.length).toBe(Object.keys(matchFacetSets).length);
		expect(matchFacetKeys.length).toBeGreaterThan(0);
	});

	// Enumerated, not listed: a facet added to matchFacetSets gets these three cases for free.
	for (const facet of matchFacetKeys) {
		test(`carries match.${facet} through normalization`, () => {
			const [value] = facetValues(facet);
			const mapping = mappingWithMatch({ [facet]: [value as string] });

			expect(mapping.rules[0]?.match).toEqual({ [facet]: [value] } as AuditProfileMatch);
		});

		test(`match.${facet} selects the profiles it names`, () => {
			const [value] = facetValues(facet);
			const mapping = mappingWithMatch({ [facet]: [value as string] });
			const profile = profileWith({ [facet]: value as string });

			expect(resolveAuditEffect(profile, auditName, mapping)).toMatchObject({
				effect: 'excluded',
				ruleId: 'facet-probe',
				source: 'global-rule',
			});
		});

		test(`match.${facet} rejects the profiles it does not name`, () => {
			const [value, other] = facetValues(facet);
			const mapping = mappingWithMatch({ [facet]: [value as string] });
			const profile = profileWith({ [facet]: other as string });

			expect(resolveAuditEffect(profile, auditName, mapping)).toMatchObject({
				applies: true,
				effect: 'default',
				source: 'default',
			});
		});
	}

	test('keeps an empty match universal', () => {
		const mapping = mappingWithMatch({});
		const first = profileWith({});
		const second = profileWith(
			Object.fromEntries(matchFacetKeys.map((facet) => [facet, facetValues(facet)[1]])),
		);

		expect(mapping.rules[0]?.match).toEqual({});
		for (const profile of [first, second]) {
			expect(resolveAuditEffect(profile, auditName, mapping)).toMatchObject({
				ruleId: 'facet-probe',
				source: 'global-rule',
			});
		}
	});

	test('carries every facet the shipped mapping rules name', async () => {
		const raw = (await Bun.file(
			join(repoRoot, 'audits', 'audit-profile-mapping.json'),
		).json()) as {
			rules: { id: string; match: Record<string, string[]> }[];
		};
		const mapping = await loadAuditProfileMapping(repoRoot);

		for (const rawRule of raw.rules) {
			const normalized = mapping.rules.find(({ id }) => id === rawRule.id);
			expect(normalized?.match).toEqual(rawRule.match as AuditProfileMatch);
		}
	});
});
