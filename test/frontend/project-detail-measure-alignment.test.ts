import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';

const srcRoot = join(process.cwd(), 'frontend', 'src');

function read(...segments: string[]): Promise<string> {
	return Bun.file(join(srcRoot, ...segments)).text();
}

describe('Project Detail measure alignment', () => {
	test('puts shared filter chrome on the same measure as its controls', async () => {
		const toolbar = await read('components', 'shared', 'FilterToolbar.tsx');

		expect(toolbar).toContain("import { tableMeasureClass } from '../../lib/tableStyles.ts'");
		expect(toolbar).toContain("'flex flex-col gap-3',\n\t\t\t\t\ttableMeasureClass,");
		expect(toolbar).not.toContain('grid max-w-[80rem]');
		expect(toolbar).not.toContain('flex max-w-[80rem] items-center');
	});

	test('lifts diary and artifact row measures to their containing compositions', async () => {
		const feed = await read('pages', 'diary', 'DiaryFeed.tsx');
		const entry = await read('pages', 'diary', 'DiaryEntryCard.tsx');
		const filter = await read('pages', 'diary', 'DiaryFilterBar.tsx');
		const timeline = await read('pages', 'diary', 'DiaryTimelineList.tsx');
		const artifacts = await read('pages', 'projects', 'detail', 'ArtifactsTab.tsx');
		const artifactRow = await read('pages', 'projects', 'detail', 'ArtifactInventoryRow.tsx');

		expect(feed).toContain('<div className="space-y-5">');
		expect(feed).not.toContain('mx-auto max-w-[61rem] space-y-5');
		expect(entry).toContain('<Card className="max-w-[61rem]" variant="panel">');
		expect(filter).toContain('<Card className="max-w-[61rem]">');
		expect(timeline).toContain('<Card className="max-w-[61rem] overflow-hidden p-0">');
		expect(artifacts).toContain('<Card className="@container max-w-[61rem]">');
		expect(artifactRow).not.toContain('max-w-[61rem]');
	});

	test('caps notes, history, maturity, and interview at their content measures', async () => {
		const notes = await read('pages', 'projects', 'detail', 'NotesTab.tsx');
		const typography = await read('lib', 'typography.ts');
		const history = await read('pages', 'projects', 'detail', 'HistoryTab.tsx');
		const maturity = await read('pages', 'projects', 'detail', 'MaturityStageBlock.tsx');
		const interview = await read('pages', 'projects', 'detail', 'InterviewQuestionRow.tsx');

		expect(typography).toContain(
			"export const monoEditorMeasureCardClass = 'max-w-[calc(100ch_+_2rem)]'",
		);
		expect(notes).toContain('flex flex-col gap-3 ${monoEditorMeasureCardClass}');
		expect(notes).not.toContain('${monoEditorMeasureClass}');
		expect(history).toContain('<Card className="max-w-[72rem] overflow-hidden p-0">');
		expect(history).not.toContain('max-w-[72rem] divide-y');
		expect(maturity).toContain('max-w-[61rem] rounded-md border border-border');
		expect(interview).toContain('className={`text-sm ${proseMeasureClass}`}');
	});

	test('caps table chrome or fills the already-capped parent', async () => {
		const audits = await read('pages', 'projects', 'detail', 'AuditsTab.tsx');
		const auditTable = await read('pages', 'projects', 'detail', 'AuditsDesktopTable.tsx');
		const reports = await read('pages', 'projects', 'detail', 'ReportsDesktopTable.tsx');
		const localRuns = await read(
			'components',
			'shared',
			'local-aidd-history',
			'LocalRunsTable.tsx',
		);
		const workingTree = await read(
			'pages',
			'projects',
			'detail',
			'workingTree',
			'WorkingTreeCard.tsx',
		);

		expect(audits).toContain('className={`space-y-4 ${tableMeasureClass}`}');
		expect(auditTable).not.toContain('tableMeasureClass');
		expect(reports).toContain('xl:block ${tableMeasureClass}');
		expect(reports).toContain('className="w-full min-w-[52rem] text-left text-sm"');
		expect(localRuns).toContain('text-sm ${tableMeasureClass}');
		expect(workingTree.match(/<Card className={`p-0 \$\{tableMeasureClass\}`}/g)).toHaveLength(
			4,
		);
		expect(workingTree).not.toContain('border-border p-4 ${tableMeasureClass}');
	});
});
