import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The project page loads a tab's code when that tab is opened. Statically importing all fifteen
 * made a visit that only showed Overview download a 418 KB route chunk, because TabPanel renders
 * nothing for an inactive tab but the import still pulls the module in.
 */
const read = (path: string): string =>
	readFileSync(resolve(process.cwd(), 'frontend', 'src', path), 'utf8');

const LAZY_TABS = [
	'ArtifactsTab',
	'AuditsTab',
	'CodeTab',
	'DependencyGraphTab',
	'DiaryTab',
	'FeaturesTab',
	'HistoryTab',
	'InterviewTab',
	'ManagementTab',
	'MilestonesTab',
	'NotesTab',
	'ProfileTab',
	'ReportsTab',
	'RepositoryTab',
	'RunsTab',
];

describe('project detail tabs load on demand', () => {
	const page = read('pages/projects/ProjectDetailPage.tsx');
	// Whitespace-collapsed: the formatter wraps the longer declarations over two lines.
	const lazyTabs = read('pages/projects/detail/lazyTabs.tsx').replaceAll(/\s+/g, ' ');

	test.each(LAZY_TABS)('%s is not imported statically by the page', (tab) => {
		expect(page).not.toContain(`from './detail/${tab}.tsx'`);
	});

	test.each(LAZY_TABS)('%s is declared with lazy() and a literal path', (tab) => {
		expect(lazyTabs).toContain(
			`export const ${tab} = lazy(() => import('./${tab}.tsx').then((m) => ({ default: m.${tab} }))`,
		);
	});

	test('the on-demand tabs sit behind one Suspense fallback; Overview stays static', () => {
		expect(page).toContain('<Suspense fallback={<LazyTabFallback />}>');
		expect(page).toContain("from './detail/OverviewSummary.tsx'");
		expect(page.indexOf('id="overview"')).toBeLessThan(page.indexOf('<Suspense'));
	});
});
