import { describe, expect, test } from 'bun:test';

import type {
	AuditOverrideEffect,
	AuditProfileOverrides,
	AuditSurface,
	ProjectAuditEvidence,
} from '../../shared/src/contracts/audit-profile-mapping-types.ts';
import type { ProjectAssuranceProfile } from '../../shared/src/contracts/project-profile.ts';

import {
	isAuditApplicableToProject,
	normalizeAuditProfileMapping,
	resolveProjectAuditEffect,
} from '../../shared/src/contracts/audit-profile-mapping.ts';

const surfaceBlocks = {
	database: { packages: ['drizzle-orm'] },
	'web-frontend': { packages: ['react'] },
};

const mapping = normalizeAuditProfileMapping({
	requiresPackages: { REACT_BEST_PRACTICES: ['react'] },
	requiresSurface: { DATABASE: 'database', lighthouse: 'web-frontend' },
	rules: [
		{
			audits: ['LIGHTHOUSE'],
			effect: 'disabled',
			id: 'toy-skip',
			match: { criticality: ['toy'] },
		},
	],
	surfaces: surfaceBlocks,
	version: 1,
});

// A profile the mapping below has no rule for, so the surface is what decides.
const profile = {
	authMode: 'login',
	bucket: 'multi_user_local',
	criticality: 'operational',
	dataSensitivity: 'personal',
	deployment: 'private_server',
	derivesFromTemplate: 'none',
	externalIntegrations: 'none',
	hasCliBinary: 'none',
	publishesReleaseArchives: 'none',
	shipsContainerImage: 'none',
	source: 'explicit',
	updatedAt: '2026-01-01T00:00:00.000Z',
} as ProjectAssuranceProfile;

function evidence(surfaces: AuditSurface[] = [], packages: string[] = []): ProjectAuditEvidence {
	return {
		packages: new Set(packages),
		surfaces: new Map(surfaces.map((surface) => [surface, 'test evidence'])),
	};
}

function pinned(audit: string, effect: AuditOverrideEffect): AuditProfileOverrides {
	return {
		audits: { [audit]: effect },
		rules: [],
		updatedAt: '2026-01-01T00:00:00.000Z',
		version: 1,
	};
}

describe('surface-scoped audit applicability', () => {
	test('an audit that requires a surface does not apply where none is detected, and says why', () => {
		expect(resolveProjectAuditEffect(profile, evidence(), 'LIGHTHOUSE', mapping)).toEqual({
			applies: false,
			effect: 'disabled',
			reason: 'requires a web frontend; none detected',
			source: 'missing-surface',
		});
		expect(resolveProjectAuditEffect(profile, evidence(), 'DATABASE', mapping)).toEqual({
			applies: false,
			effect: 'disabled',
			reason: 'requires a database; none detected',
			source: 'missing-surface',
		});
		// Each audit needs its own surface, not just any.
		const databaseOnly = evidence(['database']);
		expect(isAuditApplicableToProject(profile, databaseOnly, 'LIGHTHOUSE', mapping)).toBe(
			false,
		);
		expect(isAuditApplicableToProject(profile, databaseOnly, 'DATABASE', mapping)).toBe(true);
	});

	test('it applies where the surface is detected, under any casing of its name', () => {
		const web = evidence(['web-frontend']);
		expect(resolveProjectAuditEffect(profile, web, 'LIGHTHOUSE', mapping)).toEqual({
			applies: true,
			effect: 'default',
			source: 'default',
		});
		expect(isAuditApplicableToProject(profile, web, 'lighthouse', mapping)).toBe(true);
		expect(isAuditApplicableToProject(profile, evidence(), 'lighthouse', mapping)).toBe(false);
	});

	test('a required override stands on its own where the surface is absent', () => {
		const explicit = pinned('LIGHTHOUSE', 'required');
		expect(
			resolveProjectAuditEffect(profile, evidence(), 'LIGHTHOUSE', mapping, explicit),
		).toEqual({ applies: true, effect: 'required', source: 'override-explicit' });
		const byRule: AuditProfileOverrides = {
			audits: {},
			rules: [{ audits: ['DATABASE'], effect: 'required', id: 'has-a-store', match: {} }],
			updatedAt: '2026-01-01T00:00:00.000Z',
			version: 1,
		};
		expect(isAuditApplicableToProject(profile, evidence(), 'DATABASE', mapping, byRule)).toBe(
			true,
		);
	});

	test('an excluded or disabled override removes the audit where the surface is present', () => {
		const web = evidence(['web-frontend']);
		for (const effect of ['excluded', 'disabled'] as const) {
			expect(
				resolveProjectAuditEffect(
					profile,
					web,
					'LIGHTHOUSE',
					mapping,
					pinned('LIGHTHOUSE', effect),
				),
			).toEqual({ applies: false, effect, source: 'override-explicit' });
		}
	});

	test('a profile rule that disables the audit still wins where the surface is present', () => {
		const toy = { ...profile, criticality: 'toy' } as ProjectAssuranceProfile;
		const cell = resolveProjectAuditEffect(
			toy,
			evidence(['web-frontend']),
			'LIGHTHOUSE',
			mapping,
		);
		expect(cell).toEqual({
			applies: false,
			effect: 'disabled',
			ruleId: 'toy-skip',
			source: 'global-rule',
		});
		// And it is the rule, not the missing surface, that is reported when both would remove it.
		expect(resolveProjectAuditEffect(toy, evidence(), 'LIGHTHOUSE', mapping).source).toBe(
			'global-rule',
		);
	});

	test('an audit with a package requirement and no surface requirement behaves as before', () => {
		const audit = 'REACT_BEST_PRACTICES';
		expect(isAuditApplicableToProject(profile, evidence([], ['react']), audit, mapping)).toBe(
			true,
		);
		// Detecting every surface does not stand in for the package.
		const cell = resolveProjectAuditEffect(
			profile,
			evidence(['database', 'web-frontend']),
			audit,
			mapping,
		);
		expect(cell).toEqual({
			applies: false,
			effect: 'disabled',
			reason: 'requires one of: react; none declared',
			source: 'missing-package',
		});
		// An audit that requires neither is untouched by what the project is built from.
		expect(isAuditApplicableToProject(profile, evidence(), 'SECURITY', mapping)).toBe(true);
	});

	test('an audit that requires both needs both', () => {
		const both = normalizeAuditProfileMapping({
			requiresPackages: { FRONTEND: ['react'] },
			requiresSurface: { FRONTEND: 'web-frontend' },
			rules: [],
			surfaces: surfaceBlocks,
			version: 1,
		});
		const cases: [AuditSurface[], string[], boolean][] = [
			[['web-frontend'], ['react'], true],
			[['web-frontend'], [], false],
			[[], ['react'], false],
		];
		for (const [surfaces, packages, expected] of cases) {
			expect(
				isAuditApplicableToProject(profile, evidence(surfaces, packages), 'FRONTEND', both),
			).toBe(expected);
		}
	});
});

describe('surface blocks in the mapping', () => {
	const base = { rules: [], version: 1 };

	test('audit names are normalized and the blocks survive normalization', () => {
		expect(mapping.requiresSurface).toEqual({
			DATABASE: 'database',
			LIGHTHOUSE: 'web-frontend',
		});
		expect(mapping.surfaces).toEqual(surfaceBlocks);
	});

	test('a malformed block is rejected with the field that is wrong', () => {
		const invalid: [Record<string, unknown>, string][] = [
			[{ surfaces: [] }, 'Audit profile mapping surfaces must be an object.'],
			[
				{ surfaces: { 'mobile-app': { packages: ['expo'] } } },
				'surfaces.mobile-app is not a known surface; expected one of: database, web-frontend',
			],
			[{ surfaces: { database: ['pg'] } }, 'surfaces.database must be an object.'],
			[{ surfaces: { database: {} } }, 'surfaces.database.packages must be an array.'],
			[
				{ surfaces: { database: { packages: [] } } },
				'surfaces.database.packages must name at least one package.',
			],
			[
				{ surfaces: { database: { packages: ['pg', 7] } } },
				'surfaces.database.packages entries must be non-empty strings.',
			],
			[
				{ requiresSurface: ['LIGHTHOUSE'], surfaces: surfaceBlocks },
				'Audit profile mapping requiresSurface must be an object.',
			],
			[
				{ requiresSurface: { LIGHTHOUSE: 'browser' }, surfaces: surfaceBlocks },
				'requiresSurface.LIGHTHOUSE must be one of: database, web-frontend',
			],
			[
				{ requiresSurface: { LIGHTHOUSE: ['web-frontend'] }, surfaces: surfaceBlocks },
				'requiresSurface.LIGHTHOUSE must be one of: database, web-frontend',
			],
			[
				{ requiresSurface: { LIGHTHOUSE: 'web-frontend' } },
				'requiresSurface.LIGHTHOUSE names web-frontend, which surfaces does not define.',
			],
		];
		for (const [blocks, message] of invalid) {
			expect(() => normalizeAuditProfileMapping({ ...base, ...blocks })).toThrow(message);
		}
	});
});
