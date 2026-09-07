import { describe, expect, test } from 'bun:test';
import type { Feature } from 'aidd-shared/metadata/features';
import { toWebFeatureSummary } from '../../backend/src/services/project/listings.ts';

describe('project listings feature summary', () => {
	test('matches feature status summary type and completion semantics', () => {
		const features: Feature[] = [
			{
				auditSource: 'SECURITY',
				directory: 'audit-security-1780000000-hardening',
				id: 'audit-security-1780000000-hardening',
				passes: true,
				status: 'completed',
			},
			{
				auditSource: 'FRONTEND',
				directory: 'audit-frontend-1780000001-contrast',
				id: 'audit-frontend-1780000001-contrast',
				passes: false,
				status: 'completed',
			},
			{
				directory: 'remediation-20260603-clear-error',
				id: 'remediation-20260603-clear-error',
				status: 'completed',
			},
			{
				directory: 'dashboard-feature-summary',
				id: 'dashboard-feature-summary',
				status: 'backlog',
			},
		];

		expect(toWebFeatureSummary(features)).toEqual({
			audit: 2,
			completed: 2,
			feature: 1,
			pending: 2,
			remediation: 1,
			total: 4,
		});
	});
});
