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
	{
		file: 'components/ui/segmented-control.tsx',
		why: 'carries its own measured mask-image edge fade below sm, where the track scrolls',
	},
	{ file: 'pages/projects/detail/ArtifactViewerDialog.tsx', why: 'markdown pre and code blocks' },
	// `pages/recipes/StepOverviewCard.tsx` was exempted here as "a code block". It was one, and it
	// was also the widest bare scrollport measured in the sweep — 1623px of a 3483px command hidden
	// at 2250x1309 behind no fade, no resting scrollbar and no tab stop. The exemption is gone with
	// the class: that block now goes through `OverflowScroller` like every other scrollport, and a
	// stale exemption is precisely how the next one would slip back in.
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
		//
		// The `from-*` stop left the class list when the fade became parameterised, so it is asserted
		// through `fadeFrom[surface]` rather than inline: a scroller sitting on the page ground or on
		// `bg-muted` faded `from-card` painted *lighter* than what it covered, which reads as a
		// container wall rather than as content continuing. `card` stays the default because that is
		// what the original consumers — tables inside a Card — actually sit on.
		expect(scroller).toContain(
			'z-30 w-6 border-l border-border bg-gradient-to-r to-transparent',
		);
		expect(scroller).toContain(
			'z-30 w-6 border-r border-border bg-gradient-to-l to-transparent',
		);
		expect(scroller).toContain('fadeFrom[surface]');
		expect(scroller).toContain("card: 'from-card'");
		expect(scroller).toContain('surface = ');
		expect(scroller).toContain('group-data-[overflow-start=true]:opacity-100');
		expect(scroller).toContain('group-data-[overflow-end=true]:opacity-100');
	});

	test('a capped scrollport stays out of the page it is capped inside', async () => {
		const scroller = await read('components', 'shared', 'OverflowScroller.tsx');

		// The scroller's own `overflow-x-auto` clips what it paints, and does not stop its layout
		// overflow reaching the document. The audits matrix, capped at 925px inside a card ending at
		// y=1329, still left `document.scrollHeight` at 2184 on a 1309px viewport: 855px of page
		// below the card holding nothing. Verified by traversal, not by reading this file — the cap
		// was already correct and the page still scrolled.
		//
		// The clip margin is not decoration. This component gives the scrollport a tab stop, so a
		// root that clipped flush would shave the focus ring off the one thing it made focusable.
		expect(scroller).toContain('overflow-clip [overflow-clip-margin:4px]');
	});

	test('a scroller declares the surface it is dissolving into', async () => {
		// The default is only right inside a Card. These three are the sites measured on ground that
		// is not one: the compact tab strip sits on `--background` (#0c0f14 against the card's
		// rgb(22,26,34)), and the recipe step's command block sits on `bg-muted`. Naming the surface
		// is what keeps the cue reading as "there is more this way".
		const [tabs, command] = await Promise.all([
			read('components', 'ui', 'tabs.tsx'),
			read('pages', 'recipes', 'StepOverviewCard.tsx'),
		]);
		expect(tabs).toContain('surface="background"');
		expect(command).toContain('surface="muted"');
	});

	test('the filter track fades its edges only where it actually scrolls', async () => {
		const control = await read('components', 'ui', 'segmented-control.tsx');

		// Two reviewers measured this independently on unrelated surfaces: /skills hid two of seven
		// categories (scrollWidth 639 into 322) and /diary clipped "Releases" to "Re". The track was
		// a bare `overflow-x-auto` with no fade, no touch scrollbar and no cue, so clipped options
		// read as broken text rather than as content that continues.
		expect(control).toContain('max-sm:data-[overflow-start=true]:[--fade-start:2rem]');
		expect(control).toContain('max-sm:data-[overflow-end=true]:[--fade-end:2rem]');
		expect(control).toContain('max-sm:[mask-image:linear-gradient(to_right,');

		// Every fade class is `max-sm:`. From sm up the track wraps instead of scrolling, so there
		// is nothing to indicate and a fade there would dim an option for no reason. Comments
		// stripped: the docstring above the classes explains the mask in prose.
		const code = control.replaceAll(/\/\*[\s\S]*?\*\//g, '').replaceAll(/\/\/[^\n]*/g, '');
		for (const line of code.split('\n')) {
			if (line.includes('fade-') || line.includes('mask-image')) {
				expect(line).toContain('max-sm:');
			}
		}
	});

	test('a control whose options fit is not dimmed to advertise nothing', async () => {
		const control = await read('components', 'ui', 'segmented-control.tsx');

		// The `SidebarNav` strip this borrows from fades unconditionally, which is right there — it
		// always overflows 320px. A two-option filter never overflows, and the same unconditional
		// fade would dim its last option, the active one half the time, to signal content that does
		// not exist. So the widths default to zero and the measurement raises them.
		expect(control).toContain('max-sm:[--fade-end:0px] max-sm:[--fade-start:0px]');
		expect(control).toContain('observeOverflow(track');
		expect(control).toContain('track.dataset.overflowEnd = String(flags.end)');
	});

	test('both edge treatments measure through the one helper', async () => {
		const [scroller, control, helper] = await Promise.all([
			read('components', 'shared', 'OverflowScroller.tsx'),
			read('components', 'ui', 'segmented-control.tsx'),
			read('lib', 'observeOverflow.ts'),
		]);

		// Two components deciding independently what "has content past the edge" means is two
		// answers to one question — including the sub-pixel slack that keeps a fade from staying lit
		// at a scroll extreme, which is the kind of detail that gets fixed in one copy.
		expect(scroller).toContain("from '../../lib/observeOverflow.ts'");
		expect(control).toContain("from '../../lib/observeOverflow.ts'");
		expect(helper).toContain("scroller.addEventListener('scroll', measure");
		expect(helper).toContain('new ResizeObserver(measure)');
		for (const source of [scroller, control]) {
			expect(source).not.toContain('scrollWidth - ');
		}
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
		// Arrowing to an offscreen trigger moves only the local scrollport. `scrollIntoView` can
		// also move every ancestor, including the document, so focus and reveal are explicit.
		expect(tabs).toContain('node.focus({ preventScroll: true })');
		expect(tabs).toContain('revealElementWithinScroller(scroller, node)');
		expect(tabs).not.toContain('scrollIntoView');
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
			// The fleet counts table moved out of FeatureSummaryCard into FeatureSummaryRows when
			// it gained a card stack — the FeatureStatusCard/FeatureStatusRows split again.
			// The scroller went with the table.
			['pages', 'dashboard', 'FeatureSummaryRows.tsx'],
			['pages', 'projects', 'profileMatrix', 'ProfileMatrixTable.tsx'],
			['pages', 'recipes', 'RecipeGrid.tsx'],
			['pages', 'projects', 'detail', 'FeaturesDesktopTable.tsx'],
			['pages', 'settings', 'BackendDefaultsTable.tsx'],
			['pages', 'runs', 'UnifiedExecutionTable.tsx'],
			['pages', 'audits', 'tabs', 'CatalogTable.tsx'],
			// The last audits tab still capping its Card directly, so its matrix scrolled with no
			// fade and no tab stop while both siblings on the same page had both.
			['pages', 'audits', 'tabs', 'ApplicabilityTab.tsx'],
		];
		const missing: string[] = [];
		for (const segments of surfaces) {
			const text = await read(...segments);
			if (!text.includes('<OverflowScroller')) missing.push(segments.join('/'));
		}
		expect(missing).toEqual([]);
	});
});
