import { describe, expect, test } from 'bun:test';

import {
	cancelProjectQueries,
	invalidateProjectQueries,
} from '../../frontend/src/hooks/useProjectsShared.ts';

/**
 * A project is reachable under two identities and gets cached under whichever one the caller
 * held. `/projects/starsync` keys the detail query on the route param (`['project',
 * 'starsync']`), while the dashboard prefetches the same project under the opaque
 * base64-of-path id the API reports as `id` (`['project', 'ZDpcYXBwbGljYXRpb25zXHN0YXJzeW5j']`).
 *
 * Mutations only ever hold the opaque id, so scoping invalidation to `['project', id]` refreshed
 * the dashboard's copy and left the one on screen stale until a full reload. Only a
 * single-element key prefix-matches both, so these tests assert the key shape rather than
 * react-query's matching, which is the library's guarantee and not ours.
 */
function recordingClient() {
	const invalidated: unknown[][] = [];
	const cancelled: unknown[][] = [];
	const client = {
		cancelQueries: async (filters: { queryKey: unknown[] }) => {
			cancelled.push(filters.queryKey);
			await Promise.resolve();
		},
		invalidateQueries: async (filters: { queryKey: unknown[] }) => {
			invalidated.push(filters.queryKey);
			await Promise.resolve();
		},
	};
	return { cancelled, client: client as never, invalidated };
}

// Families whose entries are keyed by a project identity, and so must never be invalidated
// under one specific identity.
const PROJECT_SCOPED = new Set(['project', 'project-interview', 'project-reports']);

// Every shape a project-detail route can take, per buildProjectRouteIds in backend/src/paths.ts:
// the canonical basename, the `basename~hash` form used when basenames collide, and the
// encoded-path id used when no route id could be built.
const ROUTE_FORMS = ['starsync', 'starsync~9f2a1c', 'ZDpcYXBwbGljYXRpb25zXHN0YXJzeW5j'];

describe('project query invalidation', () => {
	test('invalidates each project family, not one project identity', () => {
		const { client, invalidated } = recordingClient();

		invalidateProjectQueries(client);

		expect(invalidated).toEqual([
			['project'],
			['project-reports'],
			['projects'],
			['director', 'fleet'],
		]);
	});

	test('emits a detail key that prefix-matches every route form', () => {
		const { client, invalidated } = recordingClient();

		invalidateProjectQueries(client);

		const detailKey = (invalidated.find((key) => key[0] === 'project') ?? []).map(String);
		expect(detailKey).toEqual(['project']);
		for (const form of ROUTE_FORMS) {
			// react-query matches query keys by prefix, so a one-element key reaches
			// ['project', <form>] whichever identity the URL happened to carry.
			expect(['project', form].slice(0, detailKey.length)).toEqual(detailKey);
		}
	});

	test('never narrows a project-scoped family to a single identity', () => {
		const { client, invalidated } = recordingClient();

		invalidateProjectQueries(client);

		const narrowed = invalidated.filter(
			(key) => PROJECT_SCOPED.has(String(key[0])) && key.length > 1,
		);
		expect(narrowed).toEqual([]);
	});

	test('cancels in-flight project fetches across identities too', async () => {
		const { cancelled, client } = recordingClient();

		// Cancellation runs in onMutate against the same two-identity cache; a narrowed key
		// here would leave the visible query's in-flight request racing the mutation.
		await cancelProjectQueries(client);

		const narrowed = cancelled.filter(
			(key) => PROJECT_SCOPED.has(String(key[0])) && key.length > 1,
		);
		expect(narrowed).toEqual([]);
		expect(cancelled).toContainEqual(['project']);
	});
});
