import { describe, expect, test } from 'bun:test';

import { formatAiddRunProvenance } from '../../frontend/src/lib/aiddRunProvenance.ts';

describe('aidd run provenance display', () => {
	test('renders release, revision, and every working-tree state honestly', () => {
		expect(
			formatAiddRunProvenance({
				aiddDirty: false,
				aiddRevision: '0123456789abcdef',
				aiddVersion: '2.125.0',
			}),
		).toBe('aidd 2.125.0 · 01234567 · clean');
		expect(
			formatAiddRunProvenance({
				aiddDirty: true,
				aiddRevision: 'fedcba9876543210',
				aiddVersion: '2.125.0',
			}),
		).toBe('aidd 2.125.0 · fedcba98 · dirty');
		expect(
			formatAiddRunProvenance({
				aiddDirty: null,
				aiddRevision: '89abcdef01234567',
				aiddVersion: '2.125.0',
			}),
		).toBe('aidd 2.125.0 · 89abcdef · working tree not captured');
		expect(
			formatAiddRunProvenance({
				aiddDirty: null,
				aiddRevision: null,
				aiddVersion: null,
			}),
		).toBe('aidd version not captured · working tree not captured');
	});
});
