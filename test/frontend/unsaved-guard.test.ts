import { describe, expect, test } from 'bun:test';

import { shouldBlockUnsavedNavigation } from '../../frontend/src/hooks/useUnsavedGuard.ts';

const currentLocation = {
	pathname: '/projects/agentwatch',
	search: '?tab=profile',
};

describe('unsaved navigation guard', () => {
	test('blocks a search-only navigation while dirty', () => {
		expect(
			shouldBlockUnsavedNavigation(true, currentLocation, {
				pathname: '/projects/agentwatch',
				search: '?tab=milestones',
			}),
		).toBe(true);
	});

	test('allows a search-only navigation while clean', () => {
		expect(
			shouldBlockUnsavedNavigation(false, currentLocation, {
				pathname: '/projects/agentwatch',
				search: '?tab=milestones',
			}),
		).toBe(false);
	});

	test('allows an explicitly ignored search parameter to change while dirty', () => {
		expect(
			shouldBlockUnsavedNavigation(
				true,
				currentLocation,
				{
					pathname: '/projects/agentwatch',
					search: '?tab=milestones',
				},
				['tab'],
			),
		).toBe(false);
	});

	test('still blocks when another search parameter changes beside an ignored one', () => {
		expect(
			shouldBlockUnsavedNavigation(
				true,
				currentLocation,
				{
					pathname: '/projects/agentwatch',
					search: '?tab=milestones&view=compact',
				},
				['tab'],
			),
		).toBe(true);
	});

	test('continues to block pathname navigation while dirty', () => {
		expect(
			shouldBlockUnsavedNavigation(true, currentLocation, {
				pathname: '/recipes',
				search: '',
			}),
		).toBe(true);
	});

	test('allows navigation to the current URL while dirty', () => {
		expect(shouldBlockUnsavedNavigation(true, currentLocation, currentLocation)).toBe(false);
	});
});
