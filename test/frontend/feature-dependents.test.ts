import { describe, expect, test } from 'bun:test';
import type { ProjectFeature } from '../../frontend/src/api/types.ts';
import { featureDependents } from '../../frontend/src/pages/projects/detail/featuresUtils.ts';

function feature(partial: { id: string } & Partial<ProjectFeature>): ProjectFeature {
	return { status: 'backlog', ...partial };
}

describe('featureDependents', () => {
	test('lists the features that declare a dependency on this one, sorted', () => {
		const target = feature({ id: 'schema' });
		const features = [
			target,
			feature({ dependencies: ['schema'], id: 'api' }),
			feature({ dependencies: ['schema'], id: 'admin-ui' }),
			feature({ dependencies: ['api'], id: 'unrelated' }),
		];
		expect(featureDependents(target, features)).toEqual(['admin-ui', 'api']);
	});

	test('matches a dependency written as the directory when id and directory differ', () => {
		// Derived projects have id !== directory and their dependency lists use either name, so a
		// single-key match would show an empty "Required by" for exactly those projects.
		const target = feature({ directory: 'feature-004-user-model', id: 'user-model' });
		const dependent = feature({
			dependencies: ['feature-004-user-model'],
			directory: 'feature-009-profile-page',
			id: 'profile-page',
		});
		expect(featureDependents(target, [target, dependent])).toEqual([
			'feature-009-profile-page',
		]);
	});

	test('returns canonical directory names, not the declared ref', () => {
		const target = feature({ id: 'schema' });
		const dependent = feature({
			dependencies: ['schema'],
			directory: 'feature-007-api',
			id: 'api',
		});
		expect(featureDependents(target, [target, dependent])).toEqual(['feature-007-api']);
	});

	test('ignores self-reference and non-string dependency entries', () => {
		const target = feature({
			dependencies: ['schema', 7 as unknown as string],
			id: 'schema',
		});
		expect(featureDependents(target, [target])).toEqual([]);
	});

	test('is empty when nothing depends on the feature', () => {
		const target = feature({ id: 'leaf' });
		expect(featureDependents(target, [target, feature({ id: 'other' })])).toEqual([]);
	});
});
