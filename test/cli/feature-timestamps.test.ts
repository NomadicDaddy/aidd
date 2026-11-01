import { describe, expect, test } from 'bun:test';
import { validateFeatureContract } from 'aidd-shared/metadata/features';
import type { Feature } from 'aidd-shared/metadata/features';

// Agents typing a UTC time by hand have stamped records an hour or more ahead, on 2026-10-14, 10-15
// and 10-22. Validation time is passed in, so these need no clock.

const validatedAtMs = Date.parse('2026-10-31T12:00:00.000Z');

function featureWith(fields: Partial<Feature>): Feature {
	return {
		category: 'Core',
		dependencies: [],
		description: 'A feature',
		id: 'a-feature',
		passes: false,
		status: 'backlog',
		title: 'A feature',
		...fields,
	} as Feature;
}

function messages(fields: Partial<Feature>): string[] {
	return validateFeatureContract(featureWith(fields), validatedAtMs).map(
		(issue) => issue.message,
	);
}

describe('feature timestamps', () => {
	test.each(['createdAt', 'updatedAt', 'completedAt'] as const)(
		'a %s more than 10 minutes ahead names the field and its value',
		(field) => {
			const value = '2026-10-31T12:10:01.000Z';
			expect(messages({ [field]: value })).toEqual([`${field} '${value}' is in the future`]);
		},
	);

	test('10 minutes ahead is ordinary clock skew', () => {
		expect(messages({ updatedAt: '2026-10-31T12:10:00.000Z' })).toEqual([]);
	});

	test('a past stamp is fine', () => {
		expect(messages({ updatedAt: '2026-10-31T11:00:00.000Z' })).toEqual([]);
	});

	test('an offset is read as the time it means', () => {
		// 13:00 at UTC-5 is 18:00 UTC, six hours ahead; read as text it would look an hour ahead.
		expect(messages({ updatedAt: '2026-10-31T13:00:00-05:00' })).toHaveLength(1);
		// 06:00 at UTC-5 is 11:00 UTC, an hour behind.
		expect(messages({ updatedAt: '2026-10-31T06:00:00-05:00' })).toEqual([]);
	});

	test('an unparseable stamp is not reported yet, because template records carry them', () => {
		expect(messages({ createdAt: '2026-02-01T00:00:61.000Z' })).toEqual([]);
	});
});
