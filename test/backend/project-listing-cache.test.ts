import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import {
	computeProjectFingerprint,
	ProjectListingCache,
	type ProjectListingCacheValue,
} from '../../backend/src/services/project/metadataCache.ts';
import {
	mapSettledWithConcurrency,
	PROJECT_LISTING_COMPUTE_CONCURRENCY,
} from '../../backend/src/services/project/listings.ts';

import { testTempDir } from '../_helpers/temp.ts';
function cacheValue(): ProjectListingCacheValue {
	return {
		prioritySummary: {
			auditHealth: {
				checkedAt: '2026-05-28T00:00:00.000Z',
				fresh: [],
				missing: [],
				stale: [],
				staleThresholdDays: 30,
			},
			backlog: {
				audit: { bySeverity: {}, count: 0, top: [] },
				feature: { blockedCount: 0, count: 0, readyCount: 0, top: [] },
				remediation: { count: 0, top: [] },
			},
			priorityHealth: {
				band: 'healthy',
				primaryBucket: 'healthy',
				primaryTaskType: null,
				reasons: ['No priority issues detected.'],
				score: 100,
			},
			work: [],
		},
		summary: {
			activeRuns: { count: 0, latestRunId: null },
			artifactHealth: 'fresh',
			featureStatus: [],
			featureSummary: {
				audit: 0,
				completed: 0,
				feature: 0,
				pending: 0,
				remediation: 0,
				total: 0,
			},
			featureStats: {
				closed: 0,
				dependencyBlocked: 0,
				failing: 0,
				open: 0,
				passing: 0,
				total: 0,
				waitingApproval: 0,
			},
			id: 'project',
			metadata: {
				addedAt: null,
				appVersion: null,
				artifactCheck: null,
				interview: null,
				localIterations: [],
				localRuns: [],
				maturity: {
					currentStageId: null,
					currentStageLabel: null,
					nextArtifactLabel: null,
					nextArtifactSlug: null,
					percent: 0,
					stageStatuses: [],
				},
				phase: 'coding',
				ports: null,
				profile: {
					authMode: 'none',
					bucket: 'single_user_local',
					criticality: 'utility',
					dataSensitivity: 'low',
					deployment: 'local',
					externalIntegrations: 'none',
					notes: '',
					source: 'inferred',
					updatedAt: '2026-05-28T00:00:00.000Z',
				},
				roadmap: null,
				screenMapRouteCount: null,
				specUpdatedAt: null,
				stack: {
					family: 'unknown',
					frameworks: [],
					label: 'Unknown',
					languages: [],
					runtimes: [],
					source: 'unknown',
				},
				sync: {
					lastSyncAt: null,
					lastSyncError: null,
					preferredCli: null,
					preferredModel: null,
					preferredProvider: null,
					preferredReasoningEffort: null,
					syncState: 'unknown',
				},
				templateVersion: null,
				testScenariosCount: null,
				usage: {
					totals: {
						cachedTokens: 0,
						inputTokens: 0,
						outputTokens: 0,
						reasoningTokens: 0,
						reportedCostUsd: 0,
						runCount: 0,
						runsWithReportedCost: 0,
						runsWithTokenUsage: 0,
						totalTokens: 0,
					},
				},
			},
			name: 'project',
			path: 'project',
			phase: 'coding',
			priorityHealth: {
				band: 'healthy',
				primaryBucket: 'healthy',
				primaryTaskType: null,
				reasons: ['No priority issues detected.'],
				score: 100,
			},
			root: 'project',
			routeId: 'project',
		},
	};
}

describe('ProjectListingCache', () => {
	test('deduplicates concurrent computes for the same fingerprint', async () => {
		const projectDir = await testTempDir('aidd-project-listing-cache-');
		const cache = new ProjectListingCache();
		let computeCount = 0;
		const compute = async () => {
			computeCount += 1;
			await Bun.sleep(25);
			return cacheValue();
		};
		try {
			const [first, second] = await Promise.all([
				cache.getOrCompute(projectDir, compute),
				cache.getOrCompute(projectDir, compute),
			]);

			expect(computeCount).toBe(1);
			expect(first).toBe(second);
		} finally {
			await rm(projectDir, { force: true, recursive: true });
		}
	});
});

describe('project listing stack fingerprints', () => {
	test('tracks workspace manifests, root declarations, and the fleet manifest', async () => {
		const root = await testTempDir('aidd-project-stack-fingerprint-');
		const projectDir = join(root, 'app');
		const workspaceDir = join(projectDir, 'frontend');
		const fleetManifest = join(root, 'spernakit.psd1');
		const options = { containingRoot: root, spernakitFleetManifest: fleetManifest };
		try {
			await mkdir(workspaceDir, { recursive: true });
			await writeFile(join(root, 'AGENTS.md'), 'app: [react+vite]\n');
			await writeFile(fleetManifest, "'app' = @{ spernakit_version = 'latest' }");
			await writeFile(
				join(projectDir, 'package.json'),
				JSON.stringify({ workspaces: ['frontend'] }),
			);
			await writeFile(join(workspaceDir, 'package.json'), JSON.stringify({ version: 1 }));

			const initial = await computeProjectFingerprint(projectDir, options);
			await writeFile(
				join(workspaceDir, 'package.json'),
				JSON.stringify({ dependencies: { react: '19.0.0' }, version: 2 }),
			);
			const workspaceChanged = await computeProjectFingerprint(projectDir, options);
			expect(workspaceChanged).not.toBe(initial);

			await writeFile(join(root, 'AGENTS.md'), 'app: [react+convex]\n');
			const declarationChanged = await computeProjectFingerprint(projectDir, options);
			expect(declarationChanged).not.toBe(workspaceChanged);

			await writeFile(fleetManifest, "'app' = @{ spernakit_version = '3.24.1' }");
			const manifestChanged = await computeProjectFingerprint(projectDir, options);
			expect(manifestChanged).not.toBe(declarationChanged);
		} finally {
			await rm(root, { force: true, recursive: true });
		}
	});

	test('bounds the iterations fingerprint to the window the listing can observe', async () => {
		const projectDir = await testTempDir('aidd-project-iterations-fingerprint-');
		const iterationsDir = join(projectDir, '.aidd', 'iterations');
		const artifact = (n: number) => join(iterationsDir, `${String(n).padStart(3, '0')}.json`);
		try {
			await mkdir(iterationsDir, { recursive: true });
			// 120 iterations: 001 sits well outside the newest-50 window, 120 inside it.
			for (let n = 1; n <= 120; n += 1) {
				await writeFile(artifact(n), JSON.stringify({ iteration: n }));
				await writeFile(join(iterationsDir, `${String(n).padStart(3, '0')}.log`), 'log\n');
			}

			const initial = await computeProjectFingerprint(projectDir);

			// Outside the window: the listing cannot surface it, so it must not invalidate —
			// this is what keeps the stat sweep from scaling with lifetime run history.
			await writeFile(artifact(1), JSON.stringify({ iteration: 1, mutated: true }));
			expect(await computeProjectFingerprint(projectDir)).toBe(initial);

			// .log siblings are never read by gatherLocalIterations, at any depth.
			await writeFile(join(iterationsDir, '120.log'), 'log with more content\n');
			expect(await computeProjectFingerprint(projectDir)).toBe(initial);

			// Newest artifact changing (a run finalizing) must invalidate.
			await writeFile(artifact(120), JSON.stringify({ iteration: 120, mutated: true }));
			const newestChanged = await computeProjectFingerprint(projectDir);
			expect(newestChanged).not.toBe(initial);

			// A brand-new iteration must invalidate.
			await writeFile(artifact(121), JSON.stringify({ iteration: 121 }));
			const added = await computeProjectFingerprint(projectDir);
			expect(added).not.toBe(newestChanged);

			// Deleting an artifact outside the window still moves the entry count.
			await rm(artifact(1));
			expect(await computeProjectFingerprint(projectDir)).not.toBe(added);
		} finally {
			await rm(projectDir, { force: true, recursive: true });
		}
	});

	test('tracks environment files used by runtime port discovery', async () => {
		const projectDir = await testTempDir('aidd-project-port-fingerprint-');
		try {
			await writeFile(join(projectDir, 'package.json'), JSON.stringify({ scripts: {} }));
			const initial = await computeProjectFingerprint(projectDir);
			await writeFile(join(projectDir, '.env.local'), 'BACKEND_PORT=4100\n');
			const addedEnvironment = await computeProjectFingerprint(projectDir);
			expect(addedEnvironment).not.toBe(initial);
			await writeFile(join(projectDir, '.env.local'), 'BACKEND_PORT=4101\n');
			expect(await computeProjectFingerprint(projectDir)).not.toBe(addedEnvironment);
		} finally {
			await rm(projectDir, { force: true, recursive: true });
		}
	});
});

// package.json is one of the fingerprinted root files, so rewriting it with
// different-length content moves the project fingerprint; the memo TTL must elapse for
// the cache to re-fingerprint rather than reuse the memoized value.
const FINGERPRINT_TTL_MS = 2000;

function taggedValue(tag: number): ProjectListingCacheValue {
	const base = cacheValue();
	return { ...base, summary: { ...base.summary, id: `proj-${tag}` } };
}

function tagOf(value: ProjectListingCacheValue): string {
	return value.summary.id;
}

describe('ProjectListingCache stale-while-revalidate', () => {
	test('serves a stale entry instantly on a moved fingerprint and refreshes in the background', async () => {
		const projectDir = await testTempDir('aidd-project-listing-cache-');
		await writeFile(join(projectDir, 'package.json'), JSON.stringify({ version: 1 }));
		const cache = new ProjectListingCache();
		const state = { calls: 0, version: 1 };
		const compute = async () => {
			state.calls += 1;
			await Bun.sleep(120);
			return taggedValue(state.version);
		};
		try {
			// Cold: no prior entry, so the call blocks on the compute and returns fresh.
			const coldStart = Date.now();
			const cold = await cache.getOrCompute(projectDir, compute);
			const coldMs = Date.now() - coldStart;
			expect(tagOf(cold)).toBe('proj-1');
			expect(state.calls).toBe(1);
			expect(coldMs).toBeGreaterThanOrEqual(80); // genuinely awaited the compute

			// Hit: same fingerprint within the memo window — instant, no recompute.
			const hit = await cache.getOrCompute(projectDir, compute);
			expect(tagOf(hit)).toBe('proj-1');
			expect(state.calls).toBe(1);

			// Move the fingerprint, let the memo expire, and change what a fresh compute
			// would return. The next call serves the STALE value without blocking and
			// kicks off a background refresh.
			await writeFile(
				join(projectDir, 'package.json'),
				JSON.stringify({ extra: 'xxxxxxxxxxxxxxxx', version: 2 }),
			);
			await Bun.sleep(FINGERPRINT_TTL_MS + 150);
			state.version = 2;
			const staleStart = Date.now();
			const stale = await cache.getOrCompute(projectDir, compute);
			const staleMs = Date.now() - staleStart;
			expect(tagOf(stale)).toBe('proj-1'); // old value served
			expect(staleMs).toBeLessThan(coldMs); // did not block on the recompute
			expect(state.calls).toBe(2); // background refresh started

			// Once the background refresh settles, the entry is fresh with no extra compute.
			await Bun.sleep(220);
			const fresh = await cache.getOrCompute(projectDir, compute);
			expect(tagOf(fresh)).toBe('proj-2');
			expect(state.calls).toBe(2);
		} finally {
			await rm(projectDir, { force: true, recursive: true });
		}
	}, 15_000);

	test('keeps serving the last good entry when a background refresh throws', async () => {
		const projectDir = await testTempDir('aidd-project-listing-cache-');
		await writeFile(join(projectDir, 'package.json'), JSON.stringify({ version: 1 }));
		const cache = new ProjectListingCache();
		let calls = 0;
		const compute = async () => {
			calls += 1;
			if (calls === 1) return taggedValue(1);
			throw new Error('refresh boom');
		};
		try {
			expect(tagOf(await cache.getOrCompute(projectDir, compute))).toBe('proj-1');

			await writeFile(
				join(projectDir, 'package.json'),
				JSON.stringify({ extra: 'yyyyyyyyyyyyyyyy', version: 2 }),
			);
			await Bun.sleep(FINGERPRINT_TTL_MS + 150);

			// The stale serve must not reject even though the background refresh throws.
			const stale = await cache.getOrCompute(projectDir, compute);
			expect(tagOf(stale)).toBe('proj-1');
			await Bun.sleep(50); // let the rejected refresh settle
			expect(calls).toBe(2);

			// The entry survived the failed refresh and is still served.
			expect(tagOf(await cache.getOrCompute(projectDir, compute))).toBe('proj-1');
		} finally {
			await rm(projectDir, { force: true, recursive: true });
		}
	}, 15_000);
});

describe('mapSettledWithConcurrency', () => {
	test('bounds concurrent listing computes and preserves fulfilled result order', async () => {
		let active = 0;
		let maxActive = 0;
		const settled = await mapSettledWithConcurrency(
			[0, 1, 2, 3, 4, 5, 6],
			PROJECT_LISTING_COMPUTE_CONCURRENCY,
			async (value) => {
				active += 1;
				maxActive = Math.max(maxActive, active);
				await Bun.sleep(value === 0 ? 30 : 5);
				active -= 1;
				if (value === 4) throw new Error('skip this project');
				return `project-${value}`;
			},
		);
		const fulfilled = settled
			.filter(
				(result): result is PromiseFulfilledResult<string> => result.status === 'fulfilled',
			)
			.map((result) => result.value);

		expect(maxActive).toBeLessThanOrEqual(PROJECT_LISTING_COMPUTE_CONCURRENCY);
		expect(fulfilled).toEqual([
			'project-0',
			'project-1',
			'project-2',
			'project-3',
			'project-5',
			'project-6',
		]);
		expect(settled[4]?.status).toBe('rejected');
	});
});
