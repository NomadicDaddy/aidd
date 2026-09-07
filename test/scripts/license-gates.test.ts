import { describe, expect, test } from 'bun:test';

import { unreviewedLicenses } from '../../scripts/lib/third-party-licenses/render.ts';

// Each case proves the gate rejects a release surface that omits required licensing material.
describe('unreviewedLicenses gates the whole runtime closure', () => {
	test('accepts licenses that have reviewed notice text', () => {
		expect(unreviewedLicenses([{ license: 'MIT' }, { license: 'Apache-2.0' }])).toEqual([]);
	});

	test('flags a transitive package whose license has no reviewed notice', () => {
		// A closure package, not a direct dependency: gating only the direct deps let this through.
		expect(unreviewedLicenses([{ license: 'MIT' }, { license: 'MPL-2.0' }])).toEqual([
			'MPL-2.0',
		]);
	});

	test('flags a package with no license field at all', () => {
		// collect.ts reports a missing `license` as UNKNOWN. Shipping it means shipping obligations
		// nobody read, so it must not be summarized as though they were known.
		expect(unreviewedLicenses([{ license: 'UNKNOWN' }])).toEqual(['UNKNOWN']);
	});
});
