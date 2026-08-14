import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const DETAIL_ROOT = resolve(import.meta.dir, '../../frontend/src/pages/projects/detail');
const SHARED_ROOT = resolve(import.meta.dir, '../../frontend/src/components/shared');

const detail = (file: string) => readFile(resolve(DETAIL_ROOT, file), 'utf8');
const shared = (file: string) => readFile(resolve(SHARED_ROOT, file), 'utf8');

describe('project detail density contracts', () => {
	test('bounds the compact audit inventory and discloses complete row controls', async () => {
		const list = await detail('AuditsMobileList.tsx');
		const row = await detail('AuditCompactRow.tsx');
		const content = await detail('auditRowContent.tsx');

		expect(list).toContain('ariaLabel="Project audits compact inventory"');
		expect(list).toContain('max-h-[28rem] overflow-y-auto');
		expect(list).toContain('sticky top-px');
		expect(content).toContain('aria-expanded={expanded}');
		expect(row).toContain('Override for ${row.name}');
		expect(row).toContain('runSingle(row.name, true)');
	});

	test('collapses dependency filters by content width and labels the graph scrollport', async () => {
		const filters = await detail('DependencyGraphFilters.tsx');
		const panels = await detail('dependencyGraphPanels.tsx');
		const toolbar = await shared('FilterToolbar.tsx');

		expect(filters).toContain('contentAware: true');
		expect(toolbar).toContain('@max-[48rem]:grid-cols-[minmax(0,1fr)_auto]');
		expect(panels).toContain('ariaLabel="Dependency graph canvas"');
		expect(panels).toContain('lg:h-[calc(100vh-34rem)]');
	});

	test('switches feature and artifact density against their own containers', async () => {
		const features = await detail('FeaturesTab.tsx');
		const featureTable = await detail('FeaturesDesktopTable.tsx');
		const artifacts = await detail('ArtifactsTab.tsx');

		expect(features).toContain('<Card className="@container overflow-hidden p-0">');
		expect(features).toContain('@min-[80rem]:hidden');
		expect(featureTable).toContain('hidden @min-[80rem]:block');
		expect(featureTable).toContain("source.replaceAll('_', ' ')");
		expect(artifacts).toContain('<Card className="@container max-w-[61rem]">');
		expect(artifacts).toContain('@min-[32rem]:grid-cols-4');
	});

	test('keeps repository divergence visible and short-circuits a clean tree', async () => {
		const strip = await detail('ProjectStatusStrip.tsx');
		const tree = await detail('workingTree/WorkingTreeCard.tsx');

		expect(strip).toContain('@min-[68rem]:grid-cols-6');
		expect(strip).toContain('col-span-2 @min-[32rem]:col-span-1');
		const cleanAt = tree.indexOf('if (files.length === 0)');
		expect(cleanAt).toBeGreaterThan(-1);
		expect(tree.indexOf('<WorkingTreeToolbar')).toBeGreaterThan(cleanAt);
		expect(tree.slice(cleanAt, tree.indexOf('<WorkingTreeToolbar'))).toContain('<EmptyState');
	});

	test('puts operational run history before accounting and collapses mobile details', async () => {
		const runs = await detail('RunsTab.tsx');
		const usage = await detail('ProjectUsagePanel.tsx');
		const operationalBranch = runs.slice(runs.lastIndexOf('<TabIntro'));

		expect(operationalBranch.indexOf('<ActiveRunsPanel')).toBeLessThan(
			operationalBranch.indexOf('<LocalAiddHistoryPanel'),
		);
		expect(operationalBranch.indexOf('<LocalAiddHistoryPanel')).toBeLessThan(
			operationalBranch.indexOf('<ProjectUsagePanel'),
		);
		expect(usage).toContain('aria-expanded={breakdownOpen}');
		expect(usage).toContain('Usage breakdown · {usage.byExecutionTarget.length} targets');
		expect(usage).toContain("breakdownOpen ? 'block' : 'hidden sm:block'");
		expect(usage).toContain('of input tokens');
	});

	test('contains long artifact groups with separate class tokens', async () => {
		const groups = await detail('ArtifactGroups.tsx');

		expect(groups).toContain("'flex flex-col gap-2'");
		expect(groups).toContain("'max-h-[28rem] overflow-y-auto pr-1'");
		expect(groups).not.toContain('gap-2${');
	});

	test('keeps mobile interview prompts full width without losing their names', async () => {
		const row = await detail('InterviewQuestionRow.tsx');

		expect(row).toContain('flex-col items-start');
		expect(row).toContain('sm:w-24 sm:shrink-0');
		expect(row).toContain('max-sm:line-clamp-3');
		expect(row).toContain('`Answer question: ${question.prompt}`');
	});

	test('places live profile feedback before facets and keeps the full audit list later', async () => {
		const profile = await detail('ProfileTab.tsx');
		const summaryAt = profile.indexOf('mode="summary"');
		const facetsAt = profile.indexOf('profileFacets.map');
		const auditsAt = profile.indexOf('mode="audits"');

		expect(profile).toContain('The profile facets that decide');
		expect(summaryAt).toBeGreaterThan(-1);
		expect(summaryAt).toBeLessThan(facetsAt);
		expect(auditsAt).toBeGreaterThan(facetsAt);
	});

	test('compacts milestone/history introductions and shares report empty states', async () => {
		const milestones = await detail('MilestonesTab.tsx');
		const history = await detail('HistoryTab.tsx');
		const reports = await detail('ReportsTab.tsx');

		expect(milestones).toContain('actionLayout="stacked"');
		expect(milestones).toContain('<span className="sm:hidden">Auto-place</span>');
		expect(history).toContain('About history completion times');
		expect(history).toContain('px-4 py-2 sm:py-3');
		expect(reports.match(/<EmptyState>/gu)).toHaveLength(2);
	});
});
