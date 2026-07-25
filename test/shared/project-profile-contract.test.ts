import { describe, expect, test } from 'bun:test';
import {
	normalizeProjectAssuranceProfileFile,
	normalizeProjectAssuranceProfileInput,
	projectAssuranceProfileFileSchema,
	projectAssuranceProfileInputSchema,
	projectProfileNotesMaxLength,
} from '../../shared/src/contracts/project-profile.ts';

const validInput = {
	authMode: 'tenant_rbac',
	bucket: 'public_multi_tenant',
	criticality: 'business_critical',
	dataSensitivity: 'regulated',
	deployment: 'cloud',
	externalIntegrations: 'financial_or_security',
} as const;

describe('project profile contract', () => {
	test('exports input and file schemas', () => {
		expect(projectAssuranceProfileInputSchema.required).toContain('bucket');
		expect(projectAssuranceProfileInputSchema.properties.bucket.enum).toContain(
			'public_multi_tenant',
		);
		expect(projectAssuranceProfileFileSchema.required).toContain('source');
		expect(projectAssuranceProfileFileSchema.properties.source?.enum).toEqual(['explicit']);
	});

	test('normalizes a valid canonical file profile', () => {
		const profile = normalizeProjectAssuranceProfileFile({
			...validInput,
			source: 'explicit',
			updatedAt: '2026-05-19T00:00:00.000Z',
		});

		expect(profile).toMatchObject({
			authMode: 'tenant_rbac',
			bucket: 'public_multi_tenant',
			source: 'explicit',
			updatedAt: '2026-05-19T00:00:00.000Z',
		});
	});

	test('rejects non-canonical file profiles', () => {
		expect(() => normalizeProjectAssuranceProfileFile(validInput)).toThrow(
			'Invalid project profile field: source',
		);
		expect(() =>
			normalizeProjectAssuranceProfileFile({
				...validInput,
				source: 'explicit',
			}),
		).toThrow('Invalid project profile field: updatedAt');
	});

	test('normalizes API input as an explicit profile', () => {
		const profile = normalizeProjectAssuranceProfileInput(
			validInput,
			'2026-05-19T00:00:00.000Z',
		);

		expect(profile).toMatchObject({
			bucket: 'public_multi_tenant',
			source: 'explicit',
			updatedAt: '2026-05-19T00:00:00.000Z',
		});
	});

	test('rejects invalid enum values', () => {
		expect(() =>
			normalizeProjectAssuranceProfileInput({
				...validInput,
				bucket: 'not-real',
			}),
		).toThrow('Invalid project profile field: bucket');
	});

	test('rejects non-object values', () => {
		expect(() => normalizeProjectAssuranceProfileInput(null)).toThrow(
			'Project profile must be an object.',
		);
		expect(() => normalizeProjectAssuranceProfileInput(['not', 'object'])).toThrow(
			'Project profile must be an object.',
		);
	});

	test('trims and caps notes', () => {
		const profile = normalizeProjectAssuranceProfileInput({
			...validInput,
			notes: `  ${'x'.repeat(projectProfileNotesMaxLength + 10)}  `,
		});

		expect(profile.notes).toHaveLength(projectProfileNotesMaxLength);
		expect(profile.notes?.startsWith('x')).toBe(true);
	});

	test('omits empty notes', () => {
		const profile = normalizeProjectAssuranceProfileInput({
			...validInput,
			notes: '   ',
		});

		expect(profile.notes).toBeUndefined();
	});
});
