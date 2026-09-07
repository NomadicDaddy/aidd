import { describe, expect, test } from 'bun:test';

import {
	formatAiddRunDriver,
	formatAiddRunProvenance,
} from '../../frontend/src/lib/aiddRunProvenance.ts';

describe('aidd run provenance display', () => {
	test('renders driver identity and content hash without inventing provenance', () => {
		expect(formatAiddRunDriver({})).toBe('not captured');
		expect(
			formatAiddRunDriver({
				driverId: 'SECURITY+HYGIENE',
				driverKind: 'audit',
				driverSha256: 'a'.repeat(64),
			}),
		).toBe(`audit · SECURITY+HYGIENE · ${'a'.repeat(64)}`);
	});

	test('renders release, revision, and every working-tree state honestly', () => {
		expect(
			formatAiddRunProvenance({
				aiddDirty: false,
				aiddRevision: '0123456789abcdef',
				aiddVersion: '3.0.0',
			}),
		).toBe('aidd 3.0.0 · 01234567 · clean');
		expect(
			formatAiddRunProvenance({
				aiddDirty: true,
				aiddRevision: 'fedcba9876543210',
				aiddVersion: '3.0.0',
			}),
		).toBe('aidd 3.0.0 · fedcba98 · dirty');
		expect(
			formatAiddRunProvenance({
				aiddDirty: null,
				aiddRevision: '89abcdef01234567',
				aiddVersion: '3.0.0',
			}),
		).toBe('aidd 3.0.0 · 89abcdef · working tree not captured');
		expect(
			formatAiddRunProvenance({
				aiddDirty: null,
				aiddRevision: null,
				aiddVersion: null,
			}),
		).toBe('aidd version not captured · working tree not captured');
	});
});
