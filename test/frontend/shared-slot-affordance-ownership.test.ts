import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';

const frontendSource = join(process.cwd(), 'frontend', 'src');

function read(relativePath: string): Promise<string> {
	return Bun.file(join(frontendSource, ...relativePath.split('/'))).text();
}

describe('shared header slots own their interactive treatment', () => {
	test('PageHeader renders every breadcrumb as the same visible back link', async () => {
		const header = await read('components/shared/PageHeader.tsx');
		const consumers = await Promise.all(
			[
				'pages/docs/DocsNotFound.tsx',
				'pages/notFound/NotFoundPage.tsx',
				'pages/pipelineSessions/PipelineSessionReportPage.tsx',
				'pages/projects/ProjectDetailPage.tsx',
				'pages/projects/profileMatrix/ProfileMatrixPage.tsx',
				'pages/recipes/detail/RecipeEditMode.tsx',
				'pages/recipes/detail/RecipeNotFound.tsx',
				'pages/recipes/detail/RecipeOverviewMode.tsx',
				'pages/settings/ExecutionIdentityBadgeLabPage.tsx',
			].map(read),
		);
		const docsPage = await read('pages/docs/DocsPage.tsx');

		expect(header).toContain('interface PageHeaderBreadcrumb');
		expect(header).toContain('<ArrowLeft aria-hidden="true"');
		expect(header).toContain('underline-offset-2 hover:underline');
		expect(header).toContain('linkFocusClass');
		expect(header).not.toContain('focus-visible:ring');
		expect(header).not.toContain('focus-visible:outline-none');
		expect(header).toContain('touchTargetTextClass');
		expect(header).toMatch(
			/const breadcrumbLinkClass = cn\(\s*touchTargetTextClass,\s*'inline-flex items-center gap-1/u,
		);
		for (const consumer of consumers) {
			expect(consumer).toMatch(/breadcrumb=\{\{ label: .+?, to: .+? \}\}/u);
		}
		expect(docsPage).toContain("breadcrumb: { label: 'Docs'");
	});

	test('project overview navigation actions consume the CardHeader link treatment', async () => {
		const [overview, recent] = await Promise.all([
			read('pages/projects/detail/OverviewTab.tsx'),
			read('pages/projects/detail/RecentActivity.tsx'),
		]);

		expect(overview.match(/className=\{cardHeaderLinkClass\}/gu)).toHaveLength(2);
		expect(recent).toContain('className={cardHeaderLinkClass}');
		expect(overview).not.toContain('text-xs text-accent underline-offset-2');
		expect(recent).not.toContain('text-xs text-muted-foreground hover:underline');
	});
});

describe('shared affordances remain visible and aligned', () => {
	test('History links are distinguishable at rest without making the whole row look clickable', async () => {
		const history = await read('pages/projects/detail/HistoryTab.tsx');

		expect(history).toContain('font-medium text-accent underline-offset-4 hover:underline');
		expect(history).toContain('focus-visible:ring-2 focus-visible:ring-ring/80');
		expect(history).not.toContain('focus-within:ring');
		expect(history).not.toContain('hover:bg-muted/60');
	});

	test('day disclosures share the pager axis and name the day they expand', async () => {
		const [feed, timeline] = await Promise.all([
			read('pages/diary/DiaryFeed.tsx'),
			read('pages/diary/DiaryTimelineList.tsx'),
		]);

		expect(feed).toContain('scopeLabel={group.label}');
		expect(timeline).toContain('flex justify-center border-t border-border px-3 py-2');
		expect(timeline).toContain('` from ${scopeLabel}`');
	});

	test('absence panels and crowded recipe headers use their shared house treatments', async () => {
		const [emptyState, recipes] = await Promise.all([
			read('components/shared/EmptyState.tsx'),
			read('pages/recipes/RecipeGrid.tsx'),
		]);

		expect(emptyState).toContain('rounded-xl border border-dashed');
		expect(emptyState).not.toContain('rounded-md border border-dashed');
		expect(recipes).toContain('identifier={recipe.id}');
		expect(recipes).toContain('<div className="mb-3 flex flex-wrap items-center gap-1.5">');
		expect(recipes).not.toContain('actionLayout="stacked"');
	});
});
