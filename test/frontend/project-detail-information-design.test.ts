import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { ProjectFeature } from '../../frontend/src/api/types.ts';
import {
	priorityFilterOptions,
	UNASSIGNED_PRIORITY,
} from '../../frontend/src/pages/projects/detail/featurePriorityFilters.ts';
import { featureMatchesFilters } from '../../frontend/src/pages/projects/detail/featuresUtils.ts';

const FRONTEND_SRC = resolve(import.meta.dir, '../../frontend/src');
const source = (path: string) => readFile(resolve(FRONTEND_SRC, path), 'utf8');
const detail = (file: string) => source(`pages/projects/detail/${file}`);

function feature(id: string, priority?: number): ProjectFeature {
	return { id, ...(priority === undefined ? {} : { priority }), status: 'backlog' };
}

describe('project detail information design', () => {
	test('bounds dependency nodes and defines their layer markers', async () => {
		const tab = await detail('DependencyGraphTab.tsx');
		const components = await detail('dependencyGraphComponents.tsx');
		const filters = await detail('DependencyGraphFilters.tsx');
		const register = await detail('dependencyFilterRegister.ts');

		expect(tab).toContain('new Set(filteredDirectories)');
		expect(tab).toContain('const visibleGraph = fitFeatureDependencyGraph(');
		for (const argument of [
			'graph,',
			'visibleDirectories,',
			'graphViewport.width,',
			'order,',
		]) {
			expect(tab).toContain(argument);
		}
		expect(tab).not.toContain('filteredDirectories.slice(');
		expect(tab).not.toContain('DependencyGraphPagination');
		// One list of orderings, read by the control and by the readout that names what it did.
		expect(register).toContain("{ label: 'Connections first', value: 'connections' }");
		expect(register).toContain("{ label: 'Alphabetical', value: 'alphabetical' }");
		expect(filters).toContain('options={DEPENDENCY_ORDER_OPTIONS}');
		expect(components).toContain('A must ship before B');
		expect(components).toContain('L{node.layer}');
	});

	test('stages artifact groups behind keyboard-native disclosures', async () => {
		const groups = await detail('ArtifactGroups.tsx');

		expect(groups.match(/<details/gu)?.length).toBeGreaterThanOrEqual(3);
		expect(groups).toContain('<summary className=');
		expect(groups).toContain('<DisclosureMarker />');
		expect(groups).toContain('group.summary.missing > 0');
		expect(groups).toContain('[&[open]]:col-span-full');
	});

	test('paginates both interview inventories and shows the row disclosure cue', async () => {
		const tab = await detail('InterviewTab.tsx');
		const row = await detail('InterviewQuestionRow.tsx');

		expect(tab).toContain('const INTERVIEW_PAGE_SIZE = 12');
		expect(tab.match(/<Pagination/gu)).toHaveLength(2);
		expect(row).toContain('<DisclosureMarker open={false} />');
	});

	test('keeps project diary days compact until their activity is requested', async () => {
		const tab = await detail('DiaryTab.tsx');
		const timeline = await source('pages/diary/DiaryTimelineList.tsx');

		expect(tab).toContain('activityDisclosureLimit={8}');
		expect(timeline).toContain('items.slice(0, visibleLimit)');
		expect(timeline).toMatch(/Show \$\{items\.length - visibleLimit\} more/u);
		expect(timeline).toMatch(/Show fewer\$\{scopeLabel/u);
		expect(timeline).toContain('` from ${scopeLabel}`');
	});

	test('adds clock context and deliberate run-detail disclosure to history', async () => {
		const history = await detail('HistoryTab.tsx');

		expect(history).toContain('formatTimeOfDay(event.timestamp)');
		expect(history).toContain('<details className="group mt-1 text-xs text-muted-foreground">');
		expect(history).toContain('<DisclosureMarker />');
		expect(history).toContain('Run details');
	});

	test('paginates reports with an explicit visible range', async () => {
		const reports = await detail('ReportsTab.tsx');
		const pagination = await detail('Pagination.tsx');

		expect(reports).toContain('const REPORTS_PAGE_SIZE = 12');
		expect(reports).toContain('visible.slice(');
		expect(reports).toContain('filtered={visible.length}');
		expect(reports).toContain('total={ordered.length}');
		expect(reports).toContain('<Pagination');
		expect(reports).not.toContain('visible.length > REPORTS_PAGE_SIZE');
		expect(pagination).toContain('Showing {start}–{end} of {total} items');
		expect(pagination).toContain('Array.from({ length: totalPages }');
		expect(reports).toContain('total={visible.length}');
		expect(reports).toContain('<Pagination');
	});

	test('filters features by every visible priority, including unassigned', async () => {
		const filters = await detail('FeatureFilters.tsx');
		const priorityTwo = feature('p2', 2);
		const items = [feature('p0', 0), priorityTwo, feature('none')];

		expect(filters).toContain('label="Priority"');
		expect(priorityFilterOptions(items)).toEqual([
			{ label: 'P0', value: '0' },
			{ label: 'P2', value: '2' },
			{ label: 'Unassigned', value: UNASSIGNED_PRIORITY },
		]);
		expect(
			items.filter((item) =>
				featureMatchesFilters(item, {
					milestoneFilter: 'all',
					priorityFilter: '2',
					query: '',
					sourceFilter: 'all',
					statusFilter: 'all',
				}),
			),
		).toEqual([priorityTwo]);
	});

	test('does not present an open passing record as ordinary incomplete work', () => {
		const filters = {
			milestoneFilter: 'all',
			query: '',
			sourceFilter: 'all',
			statusFilter: 'incomplete',
		} as const;
		expect(
			featureMatchesFilters({ id: 'conflict', passes: true, status: 'in_progress' }, filters),
		).toBeFalse();
		expect(
			featureMatchesFilters(
				{ id: 'workable', passes: false, status: 'in_progress' },
				filters,
			),
		).toBeTrue();
	});
});
