import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import {
	defaultProjectColumns,
	optionalProjectColumns,
	projectColumns,
	readOptionalColumns,
	visibleProjectColumns,
} from '../../frontend/src/pages/projects/projects-table-columns.ts';

const frontendSource = join(process.cwd(), 'frontend', 'src');

/**
 * Renders a project row and a profile-matrix row through react-dom/server for a set of column
 * selections, and reports the cell count of each. The header is generated from the column list and
 * the row is hand-written JSX, so only a render proves the two still describe the same table.
 */
function renderRowCellCounts(): {
	matrix: Record<string, number>;
	project: Record<string, number>;
} {
	const script = String.raw`
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { ProjectTableRow } from './src/pages/projects/ProjectTableRow.tsx';
import { ProfileMatrixRow } from './src/pages/projects/profileMatrix/ProfileMatrixRow.tsx';

const project = {
	activeRuns: [],
	artifactHealth: 'unknown',
	featureStats: { failing: 1, passing: 2, total: 3 },
	id: 'one',
	name: 'One',
	path: 'D:/apps/one',
	routeId: 'one',
	metadata: {
		addedAt: '2026-01-01T00:00:00.000Z',
		appVersion: '1.2.3',
		artifactCheck: { summary: null },
		maturity: { currentStageLabel: 'Build', percent: 40, stageStatuses: [] },
		ports: { backendPort: 4000, frontendPort: 3000 },
		profile: { bucket: 'single_user_local', source: 'inferred', updatedAt: '2026-01-01T00:00:00.000Z' },
		specUpdatedAt: '2026-01-01T00:00:00.000Z',
		stack: { family: 'unknown', frameworks: [], label: 'Unknown', languages: [], runtimes: [], source: 'unknown' },
		sync: { lastSyncAt: null, lastSyncError: null, syncState: 'clean' },
		templateVersion: '0.9.0',
		usage: {
			recentDailyTokens: [],
			totals: { reportedCostUsd: 1, runCount: 2, runsWithReportedCost: 1, runsWithTokenUsage: 1, totalTokens: 10 },
		},
	},
};

const form = {
	authMode: 'none',
	bucket: 'single_user_local',
	criticality: 'low',
	dataSensitivity: 'none',
	deployment: 'local_only',
	externalIntegrations: 'none',
};

const matrixRow = {
	dirty: false,
	form,
	posture: { label: 'Baseline', reasons: [], tone: 'neutral' },
	preview: undefined,
	project,
	saved: form,
	saving: false,
};

const collisions = { backend: new Map(), frontend: new Map() };
const noop = () => {};

function cells(element) {
	const markup = renderToStaticMarkup(
		createElement(MemoryRouter, null, createElement('table', null, createElement('tbody', null, element))),
	);
	return (markup.match(/<t[dh][ >]/g) ?? []).length;
}

function projectRow(optional) {
	return cells(
		createElement(ProjectTableRow, {
			collisions,
			gitStatus: undefined,
			optionalColumns: new Set(optional),
			portStatus: undefined,
			project,
		}),
	);
}

function matrixRowCells(showFacets) {
	return cells(
		createElement(ProfileMatrixRow, {
			onChange: noop,
			onReset: noop,
			onSave: noop,
			row: matrixRow,
			showFacets,
		}),
	);
}

const OPTIONAL = ['version', 'port', 'stack', 'profile', 'reportedCost', 'tokens', 'artifacts', 'addedAt'];
const project_ = { none: projectRow([]), all: projectRow(OPTIONAL) };
for (const key of OPTIONAL) project_[key] = projectRow([key]);

console.log(JSON.stringify({
	matrix: { edit: matrixRowCells(true), summary: matrixRowCells(false) },
	project: project_,
}));
`;
	const result = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: resolve(import.meta.dir, '../../frontend'),
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) {
		throw new Error(new TextDecoder().decode(result.stderr));
	}
	return JSON.parse(new TextDecoder().decode(result.stdout)) as {
		matrix: Record<string, number>;
		project: Record<string, number>;
	};
}

describe('wide table column strategy', () => {
	const rendered = renderRowCellCounts();

	test('the Projects table defaults to the six load-bearing columns', () => {
		expect([...defaultProjectColumns].sort()).toEqual([
			'activeRuns',
			'features',
			'git',
			'lastSync',
			'maturity',
			'name',
		]);
		expect(visibleProjectColumns(new Set()).map((column) => column.label)).toEqual([
			'Name',
			'Active runs',
			'Features',
			'Maturity',
			'Git',
			'Last Web Run',
		]);
		expect(rendered.project.none).toBe(defaultProjectColumns.size);
	});

	test('the column chooser offers exactly the eight situational columns', () => {
		expect(optionalProjectColumns.map((column) => column.label)).toEqual([
			'Version',
			'Port',
			'Stack',
			'Profile',
			'Reported Cost',
			'Tokens',
			'Artifacts',
			'Added',
		]);
		// Enabling everything restores the fourteen-column table the sweep measured, so nothing
		// was dropped on the way to a default view.
		expect(visibleProjectColumns(new Set(optionalProjectColumns.map((c) => c.key)))).toEqual([
			...projectColumns,
		]);
		expect(rendered.project.all).toBe(projectColumns.length);
	});

	test('every optional column contributes exactly one cell to the row', () => {
		// The header maps over the column list while the row is hand-written JSX; without this the
		// two drift and the whole table shifts by a column.
		for (const column of optionalProjectColumns) {
			expect(rendered.project[column.key]).toBe(defaultProjectColumns.size + 1);
		}
	});

	test('a stale persisted selection is dropped rather than trusted', () => {
		expect(readOptionalColumns(['tokens', 'port'])).toEqual(['port', 'tokens']);
		expect(readOptionalColumns(['bucket', 'name', 'lastSync'])).toEqual([]);
	});

	test('the Profile Matrix hides its six facet columns outside edit mode', () => {
		expect(rendered.matrix.summary).toBe(6);
		expect(rendered.matrix.edit).toBe(12);
	});

	test('both tables sit in a scrollport that signals and exposes its overflow', async () => {
		const [scroller, projects, matrix] = await Promise.all([
			readFile(join(frontendSource, 'components', 'shared', 'OverflowScroller.tsx'), 'utf8'),
			readFile(join(frontendSource, 'pages', 'projects', 'ProjectsTableView.tsx'), 'utf8'),
			readFile(
				join(
					frontendSource,
					'pages',
					'projects',
					'profileMatrix',
					'ProfileMatrixTable.tsx',
				),
				'utf8',
			),
		]);

		expect(projects).toContain('<OverflowScroller');
		expect(matrix).toContain('<OverflowScroller');
		// The fade is lit per side, and only while there is content past that edge.
		expect(scroller).toContain('group-data-[overflow-start=true]:opacity-100');
		expect(scroller).toContain('group-data-[overflow-end=true]:opacity-100');
		// Keyboard reach into the hidden columns, without adding a dead tab stop when it fits.
		expect(scroller).toContain('role="region"');
		expect(scroller).toContain('scroller.tabIndex = 0');
		expect(scroller).toContain("scroller.removeAttribute('tabindex')");
		// Measuring into state is what caused the identity-badge render loop.
		expect(scroller).not.toContain('useState');
	});

	test('the Profile Matrix header stays put in both axes', async () => {
		const matrix = await readFile(
			join(frontendSource, 'pages', 'projects', 'profileMatrix', 'ProfileMatrixTable.tsx'),
			'utf8',
		);
		const row = await readFile(
			join(frontendSource, 'pages', 'projects', 'profileMatrix', 'ProfileMatrixRow.tsx'),
			'utf8',
		);

		// A bounded scrollport is what `sticky top-0` sticks to; without it the header scrolls
		// away with the page, which is the defect this replaces.
		expect(matrix).toContain('max-h-[70vh] overflow-y-auto');
		expect(matrix).toContain('sticky top-0 z-20 bg-muted');
		// The leading header cell holds both axes, and the body cell keeps the row identifiable
		// while the facet selects scroll past it.
		expect(matrix).toContain('left-0 z-30');
		expect(row).toContain('sticky left-0 z-10');
	});

	test('the chooser and the mode switch report their own state', async () => {
		const [chooser, page] = await Promise.all([
			readFile(join(frontendSource, 'components', 'shared', 'ColumnChooser.tsx'), 'utf8'),
			readFile(
				join(frontendSource, 'pages', 'projects', 'profileMatrix', 'ProfileMatrixPage.tsx'),
				'utf8',
			),
		]);

		expect(chooser).toContain('aria-expanded={open}');
		expect(chooser).toContain('aria-controls={panelId}');
		expect(chooser).toContain('<Checkbox');
		// SegmentedControl renders aria-pressed per option, so the active mode is announced.
		expect(page).toContain('<SegmentedControl');
		expect(page).toContain('ariaLabel="Profile matrix columns"');
	});
});
