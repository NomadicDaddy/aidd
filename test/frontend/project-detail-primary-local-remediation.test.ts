import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

const FRONTEND_ROOT = resolve(import.meta.dir, '../../frontend');
const DETAIL_ROOT = resolve(FRONTEND_ROOT, 'src/pages/projects/detail');

function detail(file: string): Promise<string> {
	return Bun.file(resolve(DETAIL_ROOT, file)).text();
}

function frontend(file: string): Promise<string> {
	return Bun.file(resolve(FRONTEND_ROOT, 'src', file)).text();
}

function renderBrokenDependencyGraph(): string {
	const script = String.raw`
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DependencyEdgeLayer } from './src/pages/projects/detail/dependencyGraphEdges.tsx';
import { buildFeatureDependencyGraph } from './src/pages/projects/detail/dependencyGraphUtils.ts';

const graph = buildFeatureDependencyGraph([
	{ dependencies: ['cycle-b', 'missing'], directory: 'cycle-a', id: 'cycle-a', status: 'backlog' },
	{ dependencies: ['cycle-a'], directory: 'cycle-b', id: 'cycle-b', status: 'backlog' },
]);
const nodeByDirectory = new Map(graph.nodes.map((node) => [node.directory, node]));
console.log(renderToStaticMarkup(createElement(DependencyEdgeLayer, {
	blockedDependencies: new Set(),
	graph,
	nodeByDirectory,
	selectedNode: nodeByDirectory.get('cycle-a'),
	visibleEdges: graph.edges,
})));
`;
	const result = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: FRONTEND_ROOT,
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
	return new TextDecoder().decode(result.stdout).trim();
}

describe('project detail primary local remediation', () => {
	test('keeps overview maturity compact and pairs short supporting cards', async () => {
		const auditRow = await detail('MaturityAuditRow.tsx');
		const maturity = await detail('MaturityOverview.tsx');
		const stages = await detail('MaturityStageBlock.tsx');
		const page = await frontend('pages/projects/ProjectDetailPage.tsx');

		expect(auditRow).toContain('sm:grid-cols-[minmax(0,24rem)_max-content]');
		expect(maturity).toContain('xl:sticky xl:top-4');
		expect(stages).not.toContain('Run next for this stage');
		expect(page).toContain('recentActivity={');
		expect(page).not.toContain('@min-[80rem]:grid-cols-3');
	});

	test('makes feature search, priority, source, and identity presentation stable', async () => {
		const desktop = await detail('FeaturesDesktopTable.tsx');
		const filters = await detail('FeatureFilters.tsx');
		const tab = await detail('FeaturesTab.tsx');
		const hook = await detail('useFeaturesTab.ts');

		expect(filters).toContain('className="max-w-[104rem]"');
		expect(tab).toContain('deemphasizePriority = prioritiesAreUniform');
		expect(hook).toContain('featurePrioritiesAreUniform(filteredFeatures)');
		expect(desktop).toContain('truncate font-mono text-xs text-muted-foreground');
		expect(desktop).toContain('<mark className="bg-accent/20 text-foreground">');
	});

	test('uses the shared milestone measure and caps gate prose', async () => {
		const gate = await detail('MilestonesGateCallout.tsx');
		const table = await detail('MilestonesTable.tsx');
		const tab = await detail('MilestonesTab.tsx');

		expect(tab).toContain('overflow-hidden p-0 ${tableColumnClass}');
		expect(table).toContain('milestoneStatePresentation(milestone, activeMilestone)');
		expect(gate.match(/\$\{proseMeasureClass\} text-sm text-muted-foreground/gu)).toHaveLength(
			2,
		);
	});

	test('keeps dependency controls truthful and errors visible on the canvas', async () => {
		const components = await detail('dependencyGraphComponents.tsx');
		const filters = await detail('DependencyGraphFilters.tsx');
		const panels = await detail('dependencyGraphPanels.tsx');
		const register = await detail('dependencyFilterRegister.ts');
		const tab = await detail('DependencyGraphTab.tsx');
		const viewport = await detail('DependencyGraphViewportControls.tsx');
		const markup = renderBrokenDependencyGraph();

		expect(register).toContain("order !== 'connections'");
		expect(tab).toContain("setOrder('connections')");
		expect(filters).toContain("order !== 'connections'");
		expect(tab).toContain('selectedNode &&');
		expect(tab).toContain("panel.scrollIntoView({ behavior: 'smooth', block: 'start' })");
		expect(panels).toContain('scrollerClassName={viewportFillScrollerClass}');
		expect(components).toContain('aria-pressed={isSelected}');
		expect(components).toContain('A must ship before B');
		expect(viewport).toContain('if (!scrollsAcross && !scrollsDown) return null;');
		expect(markup).toContain('stroke-dasharray="4 3"');
		expect(markup).toContain('dependency-edge-arrow-error');
	});

	test('aligns run-table vocabulary and keeps full model identity in budgeted cells', async () => {
		const active = await detail('ActiveRunsPanel.tsx');
		const localTarget = await frontend(
			'components/shared/local-aidd-history/LocalRunCards.tsx',
		);
		const runs = await detail('RunsTab.tsx');

		for (const label of ['Started', 'Execution target', 'Result', 'Duration']) {
			expect(active).toContain(label);
		}
		expect(active).not.toContain('>Status<');
		expect(active).toContain('variant="compact"');
		expect(localTarget).not.toContain('variant="compact"');
		expect(runs).toContain('title="Local runs"');
	});

	test('keeps history kind, time, filters, and dense details co-visible', async () => {
		const history = await detail('HistoryTab.tsx');
		const timeline = await detail('historyTimeline.ts');

		expect(history).not.toContain('tableMeasureClass');
		expect(history).toContain('top-[var(--app-topbar-height,0px)]');
		expect(history).toContain('count: counts[value]');
		expect(history).toContain('disabled: counts[value] === 0');
		expect(history).toContain('{event.duration}');
		expect(history).toContain('<CommitChips commits={event.commits}');
		expect(timeline).toContain('historyKindTones');
	});

	test('makes repository state explicit without wasting table or ref space', async () => {
		const info = await detail('RepositoryInfoCard.tsx');
		const refs = await detail('RepositoryRefsCard.tsx');
		const tree = await detail('workingTree/WorkingTreeCard.tsx');
		const table = await detail('workingTree/WorkingTreeTable.tsx');

		expect(table).toContain('w-full min-w-[640px] table-auto');
		expect(table).toContain('px-3 py-3 whitespace-nowrap');
		expect(tree).toContain('statusSummary.map((part, index)');
		expect(tree).toContain('files.slice(0, visibleMobileCount)');
		expect(refs).toContain("branch.upstream ?? 'no upstream'");
		expect(refs).toContain('@min-[61rem]:grid-cols-2 @min-[80rem]:grid-cols-4');
		expect(info).toContain("data-scale={isLongTail ? 'long-tail' : 'linear'}");
		expect(info).toContain('max-w-[32rem] min-w-0 space-y-4');
	});
});
