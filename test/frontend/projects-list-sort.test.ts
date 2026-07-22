import { describe, expect, test } from 'bun:test';
import type { ProjectSummary } from '../../frontend/src/api/types.ts';
import {
	SORT_KEYS,
	compareProjects,
} from '../../frontend/src/pages/projects/projects-list-sort.ts';
import {
	formatProjectListReportedCost,
	formatProjectTokenCount,
	formatReportedCost,
} from '../../frontend/src/pages/projects/projects-list-shared.ts';

function makeProject(
	name: string,
	percent: number,
	reportedCostUsd = 0,
	totalTokens = 0
): ProjectSummary {
	return {
		artifactHealth: 'unknown',
		featureStats: { failing: 0, passing: 0, total: 0 },
		id: name,
		metadata: {
			appVersion: null,
			maturity: { percent },
			ports: null,
			profile: { bucket: 'single_user_local' },
			stack: {
				family: 'unknown',
				frameworks: [],
				label: 'Unknown',
				languages: [],
				runtimes: [],
				source: 'unknown',
			},
			sync: { lastSyncAt: null },
			usage: { totals: { reportedCostUsd, totalTokens } },
		},
		name,
	} as unknown as ProjectSummary;
}

describe('projects list maturity sort', () => {
	test('registers every visible project table field as a sort key', () => {
		expect([...SORT_KEYS]).toEqual([
			'name',
			'version',
			'port',
			'stack',
			'profile',
			'passing',
			'reportedCost',
			'tokens',
			'maturity',
			'artifacts',
			'git',
			'lastSync',
			'addedAt',
		]);
	});

	test('orders numeric application versions naturally', () => {
		const less = makeProject('alpha', 20);
		const more = makeProject('beta', 20);
		less.metadata.appVersion = '2.9.0';
		more.metadata.appVersion = '2.10.0';
		expect(compareProjects(less, more, 'version')).toBeLessThan(0);
		expect(compareProjects(more, less, 'version')).toBeGreaterThan(0);
	});

	test('orders profile, artifact, and git fields', () => {
		const less = makeProject('alpha', 20);
		const more = makeProject('beta', 20);
		less.metadata.profile.bucket = 'critical_regulated';
		more.metadata.profile.bucket = 'single_user_local';
		less.artifactHealth = 'fresh';
		more.artifactHealth = 'stale';
		const gitStatus = {
			alpha: {
				id: 'alpha',
				path: 'alpha',
				status: {
					ahead: 0,
					behind: 0,
					branch: 'main',
					conflicted: 0,
					staged: 0,
					state: 'clean' as const,
					total: 0,
					unstaged: 0,
					untracked: 0,
				},
			},
			beta: {
				id: 'beta',
				path: 'beta',
				status: {
					ahead: 0,
					behind: 0,
					branch: 'main',
					conflicted: 0,
					staged: 0,
					state: 'dirty' as const,
					total: 2,
					unstaged: 2,
					untracked: 0,
				},
			},
		};
		expect(compareProjects(less, more, 'profile')).toBeLessThan(0);
		expect(compareProjects(less, more, 'artifacts')).toBeLessThan(0);
		expect(compareProjects(less, more, 'git', 'asc', gitStatus)).toBeLessThan(0);
	});

	test('orders stacks by family label and then detected technologies', () => {
		const react = makeProject('react', 20);
		const spernakit = makeProject('spernakit', 20);
		react.metadata.stack = {
			family: 'react-vite',
			frameworks: ['React', 'Vite'],
			label: 'React/Vite',
			languages: ['TypeScript'],
			runtimes: ['Bun'],
			source: 'detected',
		};
		spernakit.metadata.stack = {
			family: 'spernakit',
			frameworks: ['Elysia', 'React', 'Vite'],
			label: 'Spernakit',
			languages: ['TypeScript'],
			runtimes: ['Bun'],
			source: 'package-declaration',
		};
		expect(compareProjects(react, spernakit, 'stack')).toBeLessThan(0);

		const reactNode = makeProject('react-node', 20);
		reactNode.metadata.stack = { ...react.metadata.stack, runtimes: ['Node.js'] };
		expect(compareProjects(react, reactNode, 'stack')).toBeLessThan(0);
	});

	test('orders projects by reported cost ascending', () => {
		const less = makeProject('alpha', 20, 12.5);
		const more = makeProject('beta', 20, 80);
		expect(compareProjects(less, more, 'reportedCost')).toBeLessThan(0);
		expect(compareProjects(more, less, 'reportedCost')).toBeGreaterThan(0);
	});

	test('orders projects by token count ascending', () => {
		const less = makeProject('alpha', 20, 0, 1_000);
		const more = makeProject('beta', 20, 0, 80_000);
		expect(compareProjects(less, more, 'tokens')).toBeLessThan(0);
		expect(compareProjects(more, less, 'tokens')).toBeGreaterThan(0);
	});

	test('formats only backend-reported project cost as dollars', () => {
		expect(formatReportedCost({ reportedCostUsd: 12.5, runsWithReportedCost: 1 })).toBe(
			'$12.50'
		);
		expect(formatReportedCost({ reportedCostUsd: 0, runsWithReportedCost: 0 })).toBe('Unknown');
	});

	test('formats project-list cost and token count as separate values', () => {
		expect(
			formatProjectListReportedCost({
				reportedCostUsd: 0,
				runsWithReportedCost: 0,
			})
		).toBe('—');
		expect(formatProjectTokenCount({ totalTokens: 3_228_203 })).toBe('3.2M tokens');
		expect(formatProjectTokenCount({ totalTokens: 1_022_536_087 })).toBe('1B tokens');
	});

	test('orders projects by maturity percent ascending', () => {
		const less = makeProject('alpha', 20);
		const more = makeProject('beta', 80);
		expect(compareProjects(less, more, 'maturity')).toBeLessThan(0);
		expect(compareProjects(more, less, 'maturity')).toBeGreaterThan(0);
	});

	test('breaks percent ties by name', () => {
		const a = makeProject('alpha', 50);
		const b = makeProject('beta', 50);
		expect(compareProjects(a, b, 'maturity')).toBeLessThan(0);
		expect(compareProjects(b, a, 'maturity')).toBeGreaterThan(0);
	});
});
