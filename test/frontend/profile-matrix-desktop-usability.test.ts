import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

import {
	postureFacetFields,
	profileFacets,
} from '../../frontend/src/pages/projects/detail/profile/profile-facets.ts';
import {
	emptyMatrixFilters,
	profileMatrixFilterRegister,
	profileMatrixPostureOptions,
} from '../../frontend/src/pages/projects/profileMatrix/profileMatrixFilters.ts';
import {
	defaultProfileFacetFields,
	isDefaultProfileFacetSelection,
	profileFacetColumnOptions,
	visibleProfileFacets,
} from '../../frontend/src/pages/projects/profileMatrix/profileMatrixColumns.ts';

const matrixPath = resolve(
	import.meta.dir,
	'../../frontend/src/pages/projects/profileMatrix/ProfileMatrixTable.tsx',
);
const navigationPath = resolve(
	import.meta.dir,
	'../../frontend/src/pages/projects/profileMatrix/useProfileMatrixNavigation.ts',
);
const pagePath = resolve(
	import.meta.dir,
	'../../frontend/src/pages/projects/profileMatrix/ProfileMatrixPage.tsx',
);
const toolbarPath = resolve(
	import.meta.dir,
	'../../frontend/src/pages/projects/profileMatrix/ProfileMatrixToolbar.tsx',
);
const rowPath = resolve(
	import.meta.dir,
	'../../frontend/src/pages/projects/profileMatrix/ProfileMatrixRow.tsx',
);
const formsPath = resolve(
	import.meta.dir,
	'../../frontend/src/pages/projects/profileMatrix/useProfileMatrixForms.ts',
);

function stripComments(source: string): string {
	return source.replaceAll(/\/\*[\s\S]*?\*\//g, '').replaceAll(/\/\/[^\n]*/g, '');
}

describe('Profile Matrix desktop usability', () => {
	test('offers all ten facets while defaulting to the six posture-driving columns', async () => {
		const matrix = stripComments(await Bun.file(matrixPath).text());
		const defaults = defaultProfileFacetFields();

		expect(profileFacetColumnOptions.map((option) => option.label)).toEqual(
			profileFacets.map((facet) => facet.title),
		);
		expect([...defaults]).toEqual([...postureFacetFields]);
		expect(visibleProfileFacets(defaults).map((facet) => facet.field)).toEqual([
			...postureFacetFields,
		]);
		expect(isDefaultProfileFacetSelection(defaults)).toBeTrue();
		expect(matrix).toContain('<ColumnChooser');
		expect(matrix).toContain('label="Profile facets"');
		expect(matrix).toContain('visibleFacets.map((facet) => (');
	});

	test('reveals a selected header clear of the pinned Project track', async () => {
		const navigation = stripComments(await Bun.file(navigationPath).text());

		expect(navigation).toContain("querySelector<HTMLTableCellElement>('thead th:first-child')");
		expect(navigation).toContain(
			'pinnedHeader.getBoundingClientRect().width + FACET_REVEAL_GUTTER_PX',
		);
		expect(navigation).toContain('revealElementWithinScroller(');
		expect(navigation).toContain('setActiveFacet(facet.field)');
		expect(navigation).toContain(
			'requestedFacetRef.current = { field: facet.field, scrollLeft: scroller.scrollLeft }',
		);
	});

	test('reports the facet nearest the readable edge while the table scrolls', async () => {
		const matrix = stripComments(await Bun.file(matrixPath).text());
		const navigation = stripComments(await Bun.file(navigationPath).text());

		expect(matrix).toMatch(
			/aria-current=\{\s*activeFacet === facet\.field \? 'true' : undefined\s*\}/,
		);
		expect(matrix).toContain('hasHorizontalOverflow ? (');
		expect(matrix).toContain('setHasHorizontalOverflow(flags.start || flags.end)');
		expect(navigation).toContain(
			"addEventListener('scroll', scheduleUpdate, { passive: true })",
		);
		expect(navigation).toContain(
			'if (rect.right <= readableStart || rect.left >= scrollerRight)',
		);
		expect(navigation).toContain('setActiveFacet(requestedFacet.field)');
	});

	test('snaps visible facet columns from the content-sized pinned track', async () => {
		const matrix = stripComments(await Bun.file(matrixPath).text());
		const navigation = stripComments(await Bun.file(navigationPath).text());

		expect(matrix).toContain("showFacets && 'snap-x snap-mandatory'");
		expect(matrix).not.toContain('scroll-pl-64');
		expect(matrix).toContain("const profileProjectColumnClass = 'min-w-64'");
		expect(matrix).not.toContain('max-w-64');
		expect(matrix).toContain("const snapClass = showFacets ? 'snap-start' : ''");
		expect(matrix).toContain('min-w-40 snap-start');
		expect(navigation).toContain(
			"querySelector<HTMLTableCellElement>('thead th:nth-child(2)')",
		);
		expect(navigation).toContain(
			'scroller.style.scrollPaddingInlineStart = `${firstDataHeaderElement.offsetLeft}px`',
		);
		expect(navigation).toContain('new ResizeObserver(scheduleUpdate)');
	});

	test('measures below dynamic navigator and column-selection chrome', async () => {
		const matrix = stripComments(await Bun.file(matrixPath).text());

		expect(matrix).toContain('useViewportFill<HTMLDivElement>');
		expect(matrix).toContain(
			"refreshKey: `${showFacets}:${[...visibleFacetFields].join(',')}`",
		);
		expect(matrix).toContain('viewportFillScrollerClass,');
		expect(matrix).not.toContain('max-h-[calc(100dvh-');
	});

	test('lets profile preview requests settle across ordinary rerenders', async () => {
		const forms = stripComments(await Bun.file(formsPath).text());

		expect(forms).toContain('const projectRecords = projects.data?.projects;');
		expect(forms).toContain('}, [projectRecords]);');
		expect(forms).not.toContain('}, [projectList]);');
		expect(forms).toContain('const previewRequestKey = previewRequests');
		expect(forms).toContain('useDebouncedValue(previewRequests, 300, previewRequestKey)');
	});

	test('refreshes saved rows only after persistence succeeds', async () => {
		const forms = stripComments(await Bun.file(formsPath).text());
		const saveRow = forms.slice(
			forms.indexOf('async function saveRow'),
			forms.indexOf('async function saveAll'),
		);
		const persistAt = saveRow.indexOf('await updateProjectProfile(projectId, row.form);');
		const invalidateAt = saveRow.indexOf('invalidateProjectQueries(queryClient);');
		const failureAt = saveRow.indexOf('} catch (error) {');

		expect(persistAt).toBeGreaterThanOrEqual(0);
		expect(invalidateAt).toBeGreaterThan(persistAt);
		expect(failureAt).toBeGreaterThan(invalidateAt);
		expect(saveRow.slice(failureAt)).toContain('return false;');
		expect(saveRow.slice(failureAt)).not.toContain('invalidateProjectQueries(queryClient);');
	});

	test('uses content-sized columns and only pins identity while facets can overflow', async () => {
		const matrix = stripComments(await Bun.file(matrixPath).text());
		const page = stripComments(await Bun.file(pagePath).text());
		const row = stripComments(await Bun.file(rowPath).text());

		expect(matrix).toContain('className={contentSizedTableClass}');
		expect(matrix).toContain('<Card className="hidden p-0 xl:block">');
		expect(matrix).not.toContain('contentRailClass');
		expect(matrix).toContain('showFacets && `left-0 z-30 ${pinnedLeftEdgeClass}`');
		expect(row).toContain(
			'sticky left-0 z-10 bg-card group-hover:bg-muted ${pinnedLeftEdgeClass}',
		);
		expect(row).toContain('row.dirty && showFacets');
		expect(row).toContain('pointer-events-none absolute inset-0 ${toneSurface.amber}');
		expect(row).toContain('border-l-2 border-transparent');
		expect(row).toContain('group-hover:bg-muted/40');
		expect(row).toContain(
			'<span className="font-semibold text-foreground">/{auditCount}</span>',
		);
		expect(row).toContain('<span className="text-muted-foreground">apply</span>');
		expect(row).not.toContain('microLabelClass');
		expect(page).toContain("mode === 'summary' ? 'max-w-[80rem] space-y-5'");
	});

	test('shares desktop Summary space without capping the project identity', async () => {
		const matrix = stripComments(await Bun.file(matrixPath).text());

		expect(matrix).toContain("const summaryDataWidthClass = showFacets ? '' : 'w-auto'");
		expect(matrix).toContain("const summaryProjectWidthClass = showFacets ? '' : 'w-[44ch]'");
		expect(matrix).toContain("const profileProjectColumnClass = 'min-w-64'");
		expect(matrix).not.toContain('max-w-[44ch]');
	});

	test('uses the rendered posture vocabulary in the filter', async () => {
		const toolbar = stripComments(await Bun.file(toolbarPath).text());

		expect(profileMatrixPostureOptions).toContainEqual({
			label: 'Low-exposure local',
			value: 'low',
		});
		expect(profileMatrixPostureOptions).not.toContainEqual({
			label: 'Low-exposure',
			value: 'low',
		});
		expect(toolbar).toContain('options={profileMatrixPostureOptions}');
		expect(toolbar).toContain('options={profileMatrixSourceOptions}');
		expect(toolbar).toContain('onReset={onReset}');
	});

	test('distinguishes matrix loading, absence, and filters that match nothing', async () => {
		const page = stripComments(await Bun.file(pagePath).text());
		const register = profileMatrixFilterRegister(
			{ dirtyOnly: true, posture: 'low', query: 'aidd', source: 'explicit' },
			() => undefined,
		);

		expect(profileMatrixFilterRegister(emptyMatrixFilters, () => undefined)).toBeUndefined();
		expect(register?.inForce).toEqual([
			{ label: 'Search', value: 'aidd' },
			{ label: 'Unsaved', value: 'Unsaved only' },
			{ label: 'Posture', value: 'Low-exposure local' },
			{ label: 'Source', value: 'Explicit' },
		]);
		expect(page).toContain('label="Loading project profiles…"');
		expect(page).toContain('No projects are available for profile comparison.');
		expect(page).toContain('<EmptyState filterReset="toolbar" filters={emptyFilters}>');
		expect(page).toContain('No projects match the current filters.');
	});

	test('keeps header navigation singular and only promotes a reachable save action', async () => {
		const page = stripComments(await Bun.file(pagePath).text());
		const mobile = stripComments(
			await Bun.file(
				resolve(
					import.meta.dir,
					'../../frontend/src/pages/projects/profileMatrix/ProfileMatrixMobileList.tsx',
				),
			).text(),
		);

		expect(page).toContain("breadcrumb={{ label: 'Projects', to: '/projects' }}");
		expect(page).toContain('helpSlug="profile-matrix"');
		expect(page).not.toContain('to="/projects"');
		expect(page).toContain('dirtyRows.length > 0 ? (');
		expect(page).toContain('unsavedProfileEditLabel(dirtyRows.length)');
		expect(page).toContain(
			'description="Compare assurance posture and audit applicability across the fleet."',
		);
		expect(page).toMatch(/<div>\s*<ProfileMatrixMobileList[\s\S]*<ProfileMatrixTable/);
		expect(page).toContain(
			'`Choose among all ${profileFacets.length} profile facets for editing`',
		);
		expect(mobile).toContain('activeProjectId === row.project.id');
		expect(mobile).toContain("facetsOpen ? 'Close facets' : 'Edit facets'");
		expect(mobile).toContain('aria-expanded={facetsOpen}');
		expect(page).toContain('<PageRail className="page-reveal space-y-5" rail={PAGE_RAIL}>');
		expect(page).not.toContain("mode === 'summary' ? 'reading' : 'bounded'");
	});

	test('reserves attention tone for unsaved edits rather than required-audit taxonomy', async () => {
		const row = stripComments(await Bun.file(rowPath).text());

		expect(row).toContain('{required} required</span>');
		expect(row).toContain('row.dirty ? toneSurface.amber');
		expect(row).toContain('<Badge tone="amber">{unsavedBadgeLabel}</Badge>');
		expect(row).not.toContain("required > 0 ? 'amber'");
	});
});
