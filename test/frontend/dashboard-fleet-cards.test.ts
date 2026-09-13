import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const FRONTEND = resolve(import.meta.dir, '../../frontend');

interface RenderedCards {
	activityEmpty: string;
	activityError: string;
	activityLoading: string;
	activityRows: string;
	cardIds: string[];
	legacyOrder: string[];
	maturityEmpty: string;
	maturityError: string;
	maturityLoading: string;
	maturityRows: string;
}

/**
 * Both cards in each of their four states, plus the persisted card order.
 *
 * Rendered out of process, the way the other card tests render: this repo has no DOM environment,
 * and static markup is enough to hold a card to the state it claims to be in. The subprocess runs
 * in `frontend/`, which is where React, the router and the store's dependencies resolve.
 */
function renderCards(): RenderedCards {
	const script = `
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { FleetActivityCard } from './src/pages/dashboard/FleetActivityCard.tsx';
import { FleetMaturityCard } from './src/pages/dashboard/FleetMaturityCard.tsx';
import { DASHBOARD_CARD_IDS, normalizeCardOrder } from './src/stores/dashboardStore.ts';

const STAGES = ['Specified', 'Structured', 'Mapped', 'Planned', 'Engaged', 'Audited', 'Shipped'];
const stageStatuses = (complete) =>
	STAGES.map((label, index) => ({
		id: label.toLowerCase(),
		label,
		status: index < complete ? 'complete' : index === complete ? 'partial' : 'empty',
	}));
const project = (name, complete) => ({
	artifactCounts: null,
	artifactHealth: 'fresh',
	featurePassing: 1,
	featureSummary: { audit: 0, completed: 1, feature: 1, pending: 0, remediation: 0, total: 1 },
	featureTotal: 1,
	hiddenMilestoneCount: 0,
	id: 'id-' + name,
	maturity: {
		currentStageId: STAGES[Math.min(complete, 6)].toLowerCase(),
		currentStageLabel: STAGES[Math.min(complete, 6)],
		nextArtifactLabel: complete < 7 ? 'roadmap.json' : null,
		nextArtifactSlug: complete < 7 ? 'roadmap' : null,
		percent: Math.round((complete / 7) * 100),
		stageStatuses: stageStatuses(complete),
	},
	milestoneCount: 0,
	milestones: [],
	name,
	orphaned: false,
	path: 'D:/applications/' + name,
	ports: null,
	portStatus: null,
	priorityBand: 'healthy',
	priorityScore: 70,
	routeId: name,
});
const item = (overrides) =>
	Object.assign(
		{
			durationMs: 1080000,
			executionIdentity: {
				backend: 'claude-code',
				model: 'claude-fable-5-1',
				provider: 'anthropic',
				reasoningEffort: 'high',
			},
			id: 'alpha:run:run-1',
			projectId: 'alpha',
			projectName: 'alpha',
			runId: 'run-1',
			sourceLabel: 'CLI launch',
			status: 'completed',
			statusLabel: 'Coding run completed',
			summary: '9 files edited, 3 commits',
			timestamp: '2026-08-27T11:58:00.000Z',
			title: 'Coding run',
			traceLabel: 'Run run-1',
		},
		overrides,
	);

const render = (element) => renderToStaticMarkup(h(MemoryRouter, null, element));
const maturity = (props) =>
	render(h(FleetMaturityCard, Object.assign({ isError: false, isLoading: false, onRetry: () => {} }, props)));
const activity = (props) =>
	render(
		h(
			FleetActivityCard,
			Object.assign({ isError: false, isLoading: false, onRetry: () => {}, total: 0 }, props),
		),
	);

console.log(
	JSON.stringify({
		activityEmpty: activity({ items: [] }),
		activityError: activity({ isError: true, items: [] }),
		activityLoading: activity({ isLoading: true, items: [] }),
		activityRows: activity({
			items: [
				item({}),
				item({
					id: 'beta:run:run-2',
					projectId: 'beta',
					projectName: 'beta',
					runId: 'run-2',
					status: 'failed',
					statusLabel: 'Directive run failed',
					summary: null,
					timestamp: '2026-08-27T09:04:00.000Z',
					title: 'Directive run',
					traceLabel: 'Run run-2',
				}),
			],
			total: 111,
		}),
		cardIds: [...DASHBOARD_CARD_IDS],
		legacyOrder: normalizeCardOrder([
			'active-runs',
			'feature-summary',
			'feature-queue',
			'feature-status',
			'project-health',
			'director-queue',
			'waiting-approval',
		]),
		maturityEmpty: maturity({ projects: [] }),
		maturityError: maturity({ isError: true, projects: [] }),
		maturityLoading: maturity({ isLoading: true, projects: [] }),
		maturityRows: maturity({ projects: [project('alpha', 7), project('beta', 2)] }),
	}),
);
`;
	const result = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: FRONTEND,
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
	return JSON.parse(new TextDecoder().decode(result.stdout)) as RenderedCards;
}

const cards = renderCards();

describe('fleet maturity card', () => {
	test('ranks the least mature project first and links each row to its project', () => {
		// Alphabetical order would put the fully mature 'alpha' on top. The card exists to show
		// what still owes work, so the order is the maturity, not the name.
		expect(cards.maturityRows.indexOf('>beta<')).toBeLessThan(
			cards.maturityRows.indexOf('>alpha<'),
		);
		expect(cards.maturityRows).toContain('href="/projects/beta"');
		expect(cards.maturityRows).toContain('href="/projects/alpha"');
		expect(cards.maturityRows).toContain('29%');
		expect(cards.maturityRows).toContain('100%');
	});

	test('names the next artifact each project owes, and says so when none is', () => {
		expect(cards.maturityRows).toContain('roadmap.json');
		expect(cards.maturityRows).toContain('Nothing outstanding');
		expect(cards.maturityRows).toContain('Mapped');
		expect(cards.maturityRows).toContain('Shipped');
	});

	test('renders loading, error and empty states distinctly', () => {
		expect(cards.maturityLoading).toContain('Loading fleet maturity');
		expect(cards.maturityError).toContain('Failed to load fleet maturity.');
		expect(cards.maturityError).toContain('Retry');
		expect(cards.maturityEmpty).toContain('No projects discovered.');
		// An empty fleet is not a failure, and a failure is not an empty fleet.
		expect(cards.maturityEmpty).not.toContain('Failed to load');
		expect(cards.maturityError).not.toContain('No projects discovered.');
		expect(cards.maturityLoading).not.toContain('Failed to load');
	});
});

describe('fleet activity card', () => {
	test('rows identify and link the project each entry came from', () => {
		expect(cards.activityRows).toContain('href="/projects/alpha"');
		expect(cards.activityRows).toContain('href="/projects/beta"');
		expect(cards.activityRows).toContain('Coding run completed');
		expect(cards.activityRows).toContain('Directive run failed');
		// The trace label is the disclosure that turns a row back into a specific run.
		expect(cards.activityRows).toContain('Run run-2');
	});

	test('rows carry the launch source, the duration and the execution identity', () => {
		expect(cards.activityRows).toContain('CLI launch');
		expect(cards.activityRows).toContain('18m');
		expect(cards.activityRows).toContain('claude-fable-5-1');
		// The preview is bounded, so the card states the count it is not showing.
		expect(cards.activityRows).toContain('111');
	});

	test('renders loading, error and empty states distinctly', () => {
		expect(cards.activityLoading).toContain('Loading recent activity');
		// A JSX string attribute is not a JS string literal: an escape written there reaches the
		// screen verbatim.
		expect(cards.activityLoading).not.toContain('u2026');
		expect(cards.activityError).toContain('Failed to load recent activity.');
		expect(cards.activityError).toContain('Retry');
		expect(cards.activityEmpty).toContain('No runs recorded yet.');
		expect(cards.activityEmpty).not.toContain('Failed to load');
		expect(cards.activityError).not.toContain('No runs recorded yet.');
	});
});

describe('the dashboard keeps the cards it already had', () => {
	test('the two new ids join the existing seven', () => {
		expect(cards.cardIds).toContain('fleet-maturity');
		expect(cards.cardIds).toContain('recent-activity');
		expect(cards.cardIds).toHaveLength(9);
		for (const id of [
			'active-runs',
			'director-queue',
			'feature-queue',
			'feature-status',
			'feature-summary',
			'project-health',
			'waiting-approval',
		]) {
			expect(cards.cardIds).toContain(id);
		}
	});

	test('a layout persisted before these cards existed still gains them', () => {
		expect(cards.legacyOrder).toHaveLength(9);
		expect(cards.legacyOrder).toContain('fleet-maturity');
		expect(cards.legacyOrder).toContain('recent-activity');
	});

	test('DashboardPage renders every id the store orders', async () => {
		const page = await readFile(
			join(FRONTEND, 'src/pages/dashboard/DashboardPage.tsx'),
			'utf8',
		);

		for (const id of cards.cardIds) {
			expect(page).toContain(`id: '${id}'`);
		}
	});
});

describe('activity semantics have one home', () => {
	test('both surfaces derive their timeline from aidd-shared/runs/activity', async () => {
		const [service, adapter, card] = await Promise.all([
			readFile(
				resolve(FRONTEND, '../backend/src/services/project/dashboardSummary.ts'),
				'utf8',
			),
			readFile(join(FRONTEND, 'src/pages/projects/detail/recentActivityItems.ts'), 'utf8'),
			readFile(join(FRONTEND, 'src/pages/dashboard/FleetActivityCard.tsx'), 'utf8'),
		]);

		expect(service).toContain("from 'aidd-shared/runs/activity'");
		expect(adapter).toContain("from 'aidd-shared/runs/activity'");
		// Ordering, status labels and execution identity are derived once, on the server, by the
		// module the project page reads. What is left on each surface is formatting — which is why
		// the card may format a duration and may not name a status.
		expect(card).not.toContain('statusVerb');
		expect(card).not.toContain('runStatusLabel');
		expect(adapter).not.toContain('runStatusLabel');
	});
});
