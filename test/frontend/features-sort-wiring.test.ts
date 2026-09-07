import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const DETAIL_ROOT = resolve(import.meta.dir, '../../frontend/src/pages/projects/detail');

async function detail(file: string): Promise<string> {
	return await readFile(resolve(DETAIL_ROOT, file), 'utf8');
}

describe('features tab sort parameters', () => {
	test('carry the tab prefix so they cannot collide with the Projects list', async () => {
		const source = await detail('useFeatureFilterParams.ts');
		expect(source).toContain("searchParams.get('featureSort')");
		expect(source).toContain("searchParams.get('featureDir')");
		// The Projects list owns the bare names on the same URL.
		expect(source).not.toContain("searchParams.get('sort')");
		expect(source).not.toContain("searchParams.get('dir')");
	});

	test('leave the default ordering absent from the URL', async () => {
		const source = await detail('useFeatureFilterParams.ts');
		expect(source).toContain("if (key === DEFAULT_FEATURE_SORT) next.delete('featureSort');");
		expect(source).toContain(
			"if (nextDir === DEFAULT_FEATURE_SORT_DIR) next.delete('featureDir');",
		);
	});

	// A filter shrinks the result set and can strand you past its end; a sort is a permutation, so
	// snapping to page 1 would turn "order these differently" into a navigation nobody asked for.
	test('do not reset pagination the way the filter writers do', async () => {
		const source = await detail('useFeatureFilterParams.ts');
		const toggle = source.slice(source.indexOf('function toggleSort'));
		expect(toggle).not.toContain('resetPage()');
		expect(source.slice(source.indexOf('function updateFilterParam'))).toContain('resetPage()');
	});

	// The Projects list deliberately preserves a non-default sort across a filter reset; keeping
	// the sort keys out of FEATURE_FILTER_PARAMS is what gives this tab the same behaviour.
	test('survive a filter reset', async () => {
		const utils = await detail('featuresUtils.ts');
		const params = utils.slice(utils.indexOf('FEATURE_FILTER_PARAMS'));
		expect(params.slice(0, 400)).not.toContain('featureSort');
		expect(params.slice(0, 400)).not.toContain('featureDir');
	});
});

describe('features tab sort affordances', () => {
	test('the wide table sorts through the shared header, Actions excepted', async () => {
		const header = await detail('FeaturesTableHeader.tsx');
		expect(header).toContain('<SortableColumnHeader');
		expect(header).toContain('FEATURE_SORT_COLUMNS.map');
		// Nothing orders five buttons, so that one stays a plain header.
		expect(header).toContain('<th');
		expect(header).toContain('sticky right-0');
		expect(header).toContain('scope="col"');
		expect(header).toContain('Actions');
	});

	// Both views order the same array, but only the table could change the order — switching to
	// cards silently took the capability away.
	test('the card view gets the same ordering through the shared control', async () => {
		const tab = await detail('FeaturesTab.tsx');
		expect(tab).toContain('<CardSortControl');
		expect(tab).toContain('options={FEATURE_SORT_COLUMNS}');
		expect(tab).toContain('onToggleSort={toggleSort}');
	});

	test('one comparator serves both views, applied before the page slice', async () => {
		const hook = await detail('useFeaturesTab.ts');
		expect(hook).toContain(
			'.toSorted((left, right) => compareFeatures(left, right, sortKey, sortDir, roadmap));',
		);
		expect(hook.indexOf('.toSorted(')).toBeLessThan(hook.indexOf('filteredFeatures.slice('));
	});

	test('both timestamp columns render through the one derivation', async () => {
		for (const file of ['FeaturesDesktopTable.tsx', 'FeatureMobileCard.tsx']) {
			const source = await detail(file);
			expect(source).toContain('featureAddedAt(feature)?.iso ?? null');
			expect(source).toContain('featureCompletedAt(feature)?.iso ?? null');
		}
		// The History tab reads the same rule rather than deriving completion a second way.
		expect(await detail('historyTimeline.ts')).toContain('featureCompletedAt(feature)');
	});
});
