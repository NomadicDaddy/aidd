import { describe, expect, test } from 'bun:test';

import type { ProjectMetadata } from '../../frontend/src/api/types.ts';
import { summarizeMetadataCoverage } from '../../frontend/src/pages/projects/detail/metadataCoverage.ts';

function makeMetadata(overrides: Partial<ProjectMetadata> = {}): ProjectMetadata {
	return {
		addedAt: null,
		appVersion: null,
		artifactCheck: {
			artifacts: [],
			checkedAt: '2026-06-11T00:00:00.000Z',
			staleThresholdDays: 30,
			summary: {
				fresh: 6,
				missing: 0,
				present: 6,
				requiredMissing: 0,
				stale: 0,
				total: 6,
			},
		},
		interview: null,
		localIterations: [],
		localRuns: [],
		maturity: {
			currentStageId: null,
			currentStageLabel: null,
			nextArtifactLabel: null,
			nextArtifactSlug: null,
			percent: 100,
			stageStatuses: [],
		},
		phase: 'coding',
		ports: null,
		profile: {
			authMode: 'none',
			bucket: 'single_user_local',
			criticality: 'utility',
			dataSensitivity: 'none',
			deployment: 'local',
			derivesFromTemplate: 'none',
			externalIntegrations: 'none',
			hasCliBinary: 'none',
			publishesReleaseArchives: 'none',
			shipsContainerImage: 'none',
			source: 'inferred',
			updatedAt: '2026-06-11T00:00:00.000Z',
		},
		roadmap: {
			currentMilestone: 'v2.0',
			invalidMappings: [],
			milestoneOrder: ['v2.0'],
			milestones: { 'v2.0': { completed: 1, total: 1 } },
			unmappedFeatureDirectories: [],
		},
		screenMapRouteCount: 12,
		specUpdatedAt: '2026-06-11T00:00:00.000Z',
		stack: {
			family: 'spernakit',
			frameworks: ['Elysia', 'React', 'Vite'],
			label: 'Spernakit',
			languages: ['TypeScript'],
			runtimes: ['Bun'],
			source: 'package-declaration',
		},
		sync: {
			lastSyncAt: null,
			lastSyncError: null,
			preferredCli: null,
			preferredModel: null,
			preferredProvider: null,
			preferredReasoningEffort: null,
			syncState: 'idle',
		},
		templateVersion: null,
		testScenariosCount: 8,
		usage: {
			byExecutionTarget: [],
			byMode: [],
			recentDailyTokens: [],
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
		...overrides,
	};
}

describe('project metadata coverage', () => {
	test('reports complete when every tracked metadata source is present', () => {
		const coverage = summarizeMetadataCoverage(makeMetadata());

		expect(coverage.label).toBe('Required complete');
		expect(coverage.tone).toBe('emerald');
		expect(coverage.detail).toBe('6/6 checks');
		expect(coverage.missingLabels).toEqual([]);
	});

	test('reports partial coverage with missing source labels', () => {
		const coverage = summarizeMetadataCoverage(
			makeMetadata({
				artifactCheck: null,
				roadmap: null,
				testScenariosCount: null,
			}),
		);

		expect(coverage.label).toBe('Partial');
		expect(coverage.tone).toBe('amber');
		expect(coverage.detail).toBe('3/6 checks');
		expect(coverage.missingLabels).toEqual(['roadmap', 'artifact check', 'test scenarios']);
	});

	test('reports partial coverage when required artifacts are missing', () => {
		const coverage = summarizeMetadataCoverage(
			makeMetadata({
				artifactCheck: {
					artifacts: [],
					checkedAt: '2026-06-11T00:00:00.000Z',
					staleThresholdDays: 30,
					summary: {
						fresh: 5,
						missing: 1,
						present: 5,
						requiredMissing: 1,
						stale: 0,
						total: 6,
					},
				},
			}),
		);

		expect(coverage.label).toBe('Partial');
		expect(coverage.detail).toBe('5/6 checks');
		expect(coverage.missingLabels).toEqual(['required artifacts']);
	});

	test('reports partial coverage when artifacts are stale', () => {
		const coverage = summarizeMetadataCoverage(
			makeMetadata({
				artifactCheck: {
					artifacts: [],
					checkedAt: '2026-06-11T00:00:00.000Z',
					staleThresholdDays: 30,
					summary: {
						fresh: 5,
						missing: 0,
						present: 6,
						requiredMissing: 0,
						stale: 1,
						total: 6,
					},
				},
			}),
		);

		expect(coverage.label).toBe('Partial');
		expect(coverage.detail).toBe('5/6 checks');
		expect(coverage.missingLabels).toEqual(['fresh artifacts']);
	});
});
