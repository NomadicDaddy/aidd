import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';

const srcRoot = join(process.cwd(), 'frontend', 'src');

function read(...segments: string[]): Promise<string> {
	return Bun.file(join(srcRoot, ...segments)).text();
}

// `overflow-x-auto` on a table wrapper or a strip of triggers hides content with nothing at the
// edge saying so. Everywhere else the class is fine: a `<pre>` or `<code>` block is a fixed-width
// artifact the reader already expects to scroll, and its border bounds it.
const exemptions: { file: string; why: string }[] = [
	{ file: 'components/shared/OverflowScroller.tsx', why: 'the component that owns the class' },
	{
		file: 'components/layout/SidebarNav.tsx',
		why: 'carries its own mask-image edge fade below sm, where it is a nav rail not a strip',
	},
	{ file: 'components/shared/CommitDiffDialog.tsx', why: 'diff hunks and pre blocks' },
	{ file: 'components/ui/segmented-control.tsx', why: 'a bordered control, not a scrollport' },
	{ file: 'pages/projects/detail/ArtifactViewerDialog.tsx', why: 'markdown pre and code blocks' },
	{ file: 'pages/recipes/StepOverviewCard.tsx', why: 'a code block' },
	{
		file: 'components/shared/MarkdownContent.tsx',
		why: 'the fenced-code block a markdown document renders; a command example cannot wrap',
	},
];

describe('horizontal overflow always says so', () => {
	test('no table or strip carries a bare overflow-x-auto', async () => {
		const exempt = new Set(exemptions.map((entry) => entry.file));
		const glob = new Bun.Glob('**/*.tsx');
		const offenders: string[] = [];

		for await (const file of glob.scan({ absolute: false, cwd: srcRoot, onlyFiles: true })) {
			const path = file.replaceAll('\\', '/');
			if (exempt.has(path)) continue;
			const text = await Bun.file(join(srcRoot, file)).text();
			for (const [index, line] of text.split('\n').entries()) {
				// A comment explaining why a scrollport was changed names the class it replaced,
				// so the scan has to read the code and not the prose about it.
				const code = line.replace(/\/\/.*$/, '').replace(/\/\*.*$/, '');
				if (code.includes('overflow-x-auto')) offenders.push(`${path}:${index + 1}`);
			}
		}

		expect(offenders).toEqual([]);
	});

	test('the fade clears a pinned column instead of hiding behind it', async () => {
		const scroller = await read('components', 'shared', 'OverflowScroller.tsx');

		// A pinned cell is `sticky bg-card z-10`. `from-card` over it is card-on-card, and its
		// stacking context outranks an auto-z-index sibling — so the fade was both invisible and
		// painted underneath the one column that most needs it. Both halves have to hold.
		expect(scroller).toContain('z-30 w-6 border-l border-border bg-gradient-to-r from-card');
		expect(scroller).toContain('z-30 w-6 border-r border-border bg-gradient-to-l from-card');
		expect(scroller).toContain('group-data-[overflow-start=true]:opacity-100');
		expect(scroller).toContain('group-data-[overflow-end=true]:opacity-100');
	});

	test('the compact tab strip scrolls inside a scroller and keeps its tablist', async () => {
		const tabs = await read('components', 'ui', 'tabs.tsx');

		expect(tabs).toContain('<OverflowScroller');
		expect(tabs).toContain('ariaLabel={ariaLabel}');
		// The scroller wraps the tablist; it does not replace it, or every panel's
		// `aria-labelledby` and the roving tabIndex would have nothing to point at.
		expect(tabs).toContain('role="tablist"');
		// Only the compact strip scrolls. Wrapping the wrapping strip too would emit a region
		// landmark for a scrollport that never scrolls.
		expect(tabs).toContain("className={compact ? 'flex gap-2' : 'flex flex-wrap gap-2'}");
		// Arrowing to a trigger that is off the scrollport has to bring it into view, and has to
		// do it without scrolling the page under the operator.
		expect(tabs).toContain("scrollIntoView({ block: 'nearest', inline: 'nearest' })");
	});

	test('Project Detail asks for the compact strip that scrolls', async () => {
		const page = await read('pages', 'projects', 'ProjectDetailPage.tsx');

		// Sixteen default-size triggers measured scrollWidth 1804 in a 1312 scrollport: Reports,
		// Audits, Profile and Management were off-screen with no cue of any kind.
		expect(page).toContain('ariaLabel="Project sections"');
		expect(page).toContain('density="compact"');
	});

	test('the surfaces the reviewers measured all scroll inside the scroller', async () => {
		const surfaces = [
			['pages', 'dashboard', 'FeatureSummaryCard.tsx'],
			['pages', 'projects', 'profileMatrix', 'ProfileMatrixTable.tsx'],
			['pages', 'recipes', 'RecipeGrid.tsx'],
			['pages', 'projects', 'detail', 'FeaturesDesktopTable.tsx'],
			['pages', 'settings', 'BackendDefaultsTable.tsx'],
			['pages', 'runs', 'UnifiedExecutionTable.tsx'],
			['pages', 'audits', 'tabs', 'CatalogTable.tsx'],
		];
		const missing: string[] = [];
		for (const segments of surfaces) {
			const text = await read(...segments);
			if (!text.includes('<OverflowScroller')) missing.push(segments.join('/'));
		}
		expect(missing).toEqual([]);
	});
});
