import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const DETAIL_ROOT = resolve(import.meta.dir, '../../frontend/src/pages/projects/detail');
const FRONTEND_SRC = resolve(import.meta.dir, '../../frontend/src');

async function detail(file: string): Promise<string> {
	return await readFile(resolve(DETAIL_ROOT, file), 'utf8');
}

async function src(file: string): Promise<string> {
	return await readFile(resolve(FRONTEND_SRC, file), 'utf8');
}

describe('dependency-graph edges', () => {
	test('are 1px, dimmed off the hovered path, and accent only on it', async () => {
		const source = await detail('dependencyGraphEdges.tsx');
		expect(source).toContain('strokeWidth={isSelectedEdge ? 2 : 1}');
		expect(source).toContain("'text-accent opacity-100'");
		expect(source).toContain("'text-border opacity-15'");
		expect(source).toContain("'text-border opacity-70'");
	});
});

describe('per-row action cells', () => {
	test('delete repeated down a list is quiet until hover, never filled danger', async () => {
		const tones = await src('lib/tones.ts');
		expect(tones).toContain('export const dangerRowActionClass');

		for (const file of ['FeatureActionVariants.tsx', 'MilestonesTable.tsx']) {
			const source = await detail(file);
			expect(source).toContain('dangerRowActionClass');
			expect(source).not.toContain('variant="danger"');
		}
	});

	test('a feature row offers at most one filled primary', async () => {
		const source = await detail('FeatureActionVariants.tsx');
		// `Approve with decision` sat beside `Approve` as a second filled primary, so the row put
		// two equal-weight calls to action next to a destructive one.
		expect(source).toContain('title="Approve with decision"\n\t\t\t\tvariant="secondary">');
	});

	test('the audits row keeps its two secondaries', async () => {
		const source = await detail('AuditsDesktopTable.tsx');
		expect(source).not.toContain('variant="danger"');
		expect(source).not.toContain('variant="primary"');
	});
});

describe('git refs', () => {
	test('render mono wherever the repository cards state one', async () => {
		const refs = await detail('RepositoryRefsCard.tsx');
		expect(refs.match(/font-mono/gu)?.length ?? 0).toBeGreaterThanOrEqual(6);

		const info = await detail('RepositoryInfoCard.tsx');
		expect(info).toContain('<Stat label="Current branch" mono value={info.currentBranch} />');
		expect(info).toContain("mono ? 'font-mono break-all' : 'tabular-nums'");
		expect(info).toContain('<code className="font-mono text-xs text-foreground">');
	});
});

describe('code browser', () => {
	test('both panes take one viewport-derived height and scroll inside it', async () => {
		const shared = await detail('codeBrowserHeight.ts');
		expect(shared).toContain("export const codeBrowserHeightClass = 'lg:h-[calc(100vh-19rem)]");
		expect(shared).toContain('export const codeBrowserScrollerClass');

		const tab = await detail('CodeTab.tsx');
		expect(tab).toContain('codeBrowserHeightClass');

		for (const file of ['CodeFileTree.tsx', 'CodeFileViewer.tsx']) {
			const source = await detail(file);
			expect(source).toContain('codeBrowserScrollerClass');
			// The old per-pane caps: 34rem on the tree, 42rem on the viewer, 128px apart.
			expect(source).not.toContain('max-h-[34rem]');
			expect(source).not.toContain('max-h-[42rem]');
		}
	});
});

describe('artifact inventory', () => {
	test('both inventories render one row component under one type rule', async () => {
		const row = await detail('ArtifactInventoryRow.tsx');
		expect(row).toContain('function labelAddsNothing');
		expect(row).toContain('truncate font-mono text-sm text-foreground');
		expect(row).toContain('truncate text-sm font-medium text-foreground');

		for (const file of ['ArtifactRow.tsx', 'MaturityArtifactRow.tsx']) {
			const source = await detail(file);
			expect(source).toContain('<ArtifactInventoryRow');
			// The row shell belongs to the shared component; an adapter that still draws one has
			// forked the type treatment again.
			expect(source).not.toContain('rounded-md border border-border px-2.5');
		}
	});
});

describe('relative age', () => {
	test('is one component with the exact stamp in the tooltip', async () => {
		const component = await src('components/shared/RelativeAge.tsx');
		expect(component).toContain('<time');
		expect(component).toContain('title={formatDate(value)}');
		expect(component).toContain('dateTime=');
	});

	test('project-detail surfaces use it rather than their own spelling', async () => {
		const users = [
			'ArtifactInventoryRow.tsx',
			'ArtifactViewerDialog.tsx',
			'ArtifactsTab.tsx',
			'HistoryTab.tsx',
			'MaturityAuditRow.tsx',
			'OverviewTab.tsx',
			'RecentActivity.tsx',
			'ReportsTab.tsx',
			'RepositoryInfoCard.tsx',
			'ReportsTab.tsx',
		];
		for (const file of users) {
			const source = await detail(file);
			expect(source).toContain('<RelativeAge');
			// The four spellings this replaced all wrote both values inline, one order or the other.
			expect(source).not.toMatch(/\{formatDate\([^)]*\)\} \(\{formatRelativeAge/u);
		}
	});
});

describe('management tab', () => {
	test('the destructive card is legible as destructive at the card level', async () => {
		const source = await detail('DeleteProjectCard.tsx');
		expect(source).toContain('toneBorder.red');
		expect(source).toContain('toneSurface.red');
	});
});

describe('profile tab', () => {
	test('the commit action sits below the fields it commits', async () => {
		const panel = await detail('profile/ComputedProfilePanel.tsx');
		expect(panel).not.toContain('Save profile');
		expect(panel).not.toContain('onSave');

		const tab = await detail('ProfileTab.tsx');
		expect(tab).toContain('Save profile');
		const saveAt = tab.indexOf('Save profile');
		const railAt = tab.indexOf('<ComputedProfilePanel');
		// Below the fields means after them in the column, and the rail no longer carries it.
		expect(saveAt).toBeGreaterThan(tab.indexOf('NotesCard'));
		expect(railAt).toBeGreaterThan(saveAt);
	});
});

describe('diary tab', () => {
	test('fills the shell like its sibling tabs while /diary keeps its reading column', async () => {
		const tab = await detail('DiaryTab.tsx');
		expect(tab).toContain('width="full"');

		const feed = await readFile(resolve(FRONTEND_SRC, 'pages/diary/DiaryFeed.tsx'), 'utf8');
		expect(feed).toContain("width = 'reading'");
		expect(feed).toContain("width === 'reading' && 'max-w-5xl'");

		const page = await readFile(resolve(FRONTEND_SRC, 'pages/diary/DiaryPage.tsx'), 'utf8');
		expect(page).not.toContain('width="full"');
	});
});
