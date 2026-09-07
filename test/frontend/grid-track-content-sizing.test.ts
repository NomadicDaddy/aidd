import { Glob } from 'bun';
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SRC = resolve(import.meta.dir, '../../frontend/src');

function source(relative: string): string {
	return readFileSync(join(SRC, relative), 'utf8');
}

/**
 * Every file that declares a grid column template only above a container or breakpoint step while
 * also rendering machine text. Below its step such a grid falls back to a single implicit `auto`
 * track, and an `auto` track's base size is its widest item's min-content contribution — which for
 * an unbroken repository path or commit hash is the whole string, so the track outgrows its
 * container and paints its own right edge off screen.
 *
 * Each entry is a site that was read rather than pattern-matched. A grep for grids lacking
 * `min-w-0` is an audit surface, not a defect count: most of these are safe because the item side
 * already zeroes the contribution, and a few carry no machine text into the grid at all. Adding a
 * gated-only grid to a file that renders machine text fails this test until someone looks at it.
 */
const REVIEWED_GATED_GRIDS: Record<string, string> = {
	'pages/about/AboutPage.tsx': 'the machine-value definition track uses minmax(0,1fr)',
	'pages/director/DirectorProfileSection.tsx': 'form controls carry min-w-0',
	'pages/projects/CandidateIntakePreview.tsx': 'the hash-bearing dd carries min-w-0',
	'pages/projects/detail/ArtifactInventoryRow.tsx': 'items carry min-w-0 and truncate',
	'pages/projects/detail/AuditCompactRow.tsx':
		'items carry min-w-0; the mono dd carries break-all',
	'pages/projects/detail/FeatureDetailsDialog.tsx':
		'prose and pre content wraps; the inner detail grid declares a base template',
	'pages/projects/detail/HistoryTab.tsx':
		'the title track is minmax(18rem,1fr), and every machine value lives below it',
	'pages/projects/detail/MaturityAuditRow.tsx': 'items carry min-w-0 and truncate',
	'pages/projects/detail/NotesTab.tsx':
		'the grid itself carries min-w-0 and both tracks are minmax(0,…)',
	'pages/projects/detail/OverviewTab.tsx': 'holds Cards, no machine text of its own',
	'pages/projects/detail/RepositoryInfoCard.tsx': 'items carry min-w-0',
	'pages/projects/detail/profile/ComputedProfilePanel.tsx': 'items carry min-w-0 and truncate',
	'pages/recipes/StepOverviewCard.tsx': 'items carry min-w-0',
	'pages/recipes/detail/RecipeMetadataCard.tsx': 'items carry min-w-0',
	'pages/recipes/detail/RecipeParamsOverview.tsx':
		'the mono dt carries break-words, the dd is prose',
	'pages/scheduled/ScheduleFields.tsx': 'form fields and a wrapped date list, no unbroken string',
	'pages/settings/BackendDefaultsTable.tsx':
		'backend cards carry min-w-0 and the machine probe line wraps or truncates',
	'pages/settings/DirectAiSection.tsx': 'form controls carry min-w-0 and machine values wrap',
	'pages/settings/GeneralDefaultsSection.tsx': 'form controls carry min-w-0',
	'pages/settings/ProviderConfigSection.tsx': 'items carry min-w-0',
	'pages/settings/SettingsSectionTabs.tsx': 'form tracks use minmax(0,...) where needed',
	'pages/settings/SharedMetadataSection.tsx': 'form controls carry min-w-0',
	'pages/settings/SpernakitScaffoldingSection.tsx': 'form controls carry min-w-0',
	'pages/settings/TriumvirateSection.tsx': 'form controls carry min-w-0',
	'pages/telemetry/InvocationDetails.tsx': 'items carry min-w-0',
};

/** Files with a `grid-cols-` only behind a `:` prefix, among those rendering machine text. */
function gatedOnlyGridFiles(): string[] {
	const found = new Set<string>();
	for (const entry of new Glob('**/*.tsx').scanSync(SRC)) {
		const relative = entry.split(String.fromCharCode(92)).join('/');
		const text = source(relative);
		if (!/font-mono|break-all/u.test(text)) continue;
		for (const match of text.matchAll(
			/(?:className=\{?["'`]|\s')([^"'`]*grid-cols-[^"'`]*)/gu,
		)) {
			if (!/(?:^|\s)grid-cols-/u.test(match[1]!)) found.add(relative);
		}
	}
	return [...found].sort();
}

describe('grids that can receive an unbroken machine string are not sized by it', () => {
	test('Dashboard suggestion tracks and items can shrink below machine-string min-content', () => {
		const queue = source('pages/dashboard/DirectorQueueCard.tsx');

		expect(queue).toContain('grid grid-cols-[minmax(0,1fr)] gap-3 @min-[44rem]:grid-cols-2');
		expect(queue).toContain('className="min-w-0 rounded-md border border-border');
	});

	test('the dependency selection track and its machine-string rows can shrink', () => {
		const components = source('pages/projects/detail/dependencyGraphComponents.tsx');
		const panel = source('pages/projects/detail/SelectedFeaturePanel.tsx');
		const tab = source('pages/projects/detail/DependencyGraphTab.tsx');

		expect(tab).toContain("'grid min-w-0 grid-cols-[minmax(0,1fr)] items-start gap-4'");
		expect(tab).toContain('className="min-w-0 @min-[100rem]:sticky');
		expect(panel).toContain('<Card className="min-w-0 space-y-5"');
		expect(panel).toContain("'min-w-0 truncate rounded-md border px-3 py-2 font-mono text-xs'");
		expect(components).toContain('<li className="min-w-0" key={directory}>');
		expect(components).toContain('className="w-full min-w-0 rounded-md border');
	});

	test('the project code browser declares a base template and lets its tree pane be narrow', () => {
		const tab = source('pages/projects/detail/CodeTab.tsx');
		const grid = tab.slice(tab.indexOf("'grid min-h-[32rem]"));

		// Both halves of the fix. The track side stops the column growing past its container; the
		// item side stops the aside demanding the width in the first place. The panes inside carry
		// their own truncation and need a parent allowed to be narrower than their content.
		expect(grid).toContain('grid-cols-[minmax(0,1fr)]');
		expect(tab).toContain('<aside className="order-1 min-w-0 border-b border-border');
		expect(tab).toContain('<section className="order-2 min-w-0');
	});

	test('About is the house exemplar: a content-sized label track and min-w-0 values', () => {
		const about = source('pages/about/AboutPage.tsx');
		const definitions = about.match(/<dd className="[^"]*"/gu) ?? [];

		// A deliberately content-sized track is legitimate — criterion 5 protects it — as long as
		// the track that receives the machine string is the one that cannot be sized by content.
		expect(about).toContain('grid-cols-[max-content_minmax(0,1fr)]');
		expect(definitions.length).toBeGreaterThan(0);
		for (const dd of definitions) expect(dd).toContain('min-w-0');
	});

	test('every gated-only grid in a file rendering machine text has been reviewed', () => {
		expect(gatedOnlyGridFiles()).toEqual(Object.keys(REVIEWED_GATED_GRIDS).sort());
	});
});
