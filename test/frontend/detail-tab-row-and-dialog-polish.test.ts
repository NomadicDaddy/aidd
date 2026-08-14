import { describe, expect, test } from 'bun:test';
import { join, resolve } from 'node:path';

const SRC = resolve(import.meta.dir, '../../frontend/src');

function detail(file: string): Promise<string> {
	return Bun.file(join(SRC, 'pages/projects/detail', file)).text();
}

function diary(file: string): Promise<string> {
	return Bun.file(join(SRC, 'pages/diary', file)).text();
}

describe('Project Detail row and dialog polish', () => {
	test('aligns artifact metadata and keeps only actionable health metrics', async () => {
		const row = await detail('ArtifactInventoryRow.tsx');
		const tab = await detail('ArtifactsTab.tsx');
		const tiles = tab.slice(
			tab.indexOf('const tiles'),
			tab.indexOf('return (', tab.indexOf('const tiles')),
		);

		expect(row).toContain('sm:grid-cols-[11rem_5rem_7rem]');
		expect(tiles).toContain("label: 'Fresh'");
		expect(tiles).toContain("label: 'Stale'");
		expect(tiles).toContain("label: 'Missing'");
		expect(tiles).toContain("label: 'Required missing'");
		expect(tiles).not.toContain("label: 'Present'");
		expect(tiles).not.toContain("label: 'Total'");
	});

	test('uses the large title step for the large artifact viewer', async () => {
		const viewer = await detail('ArtifactViewerDialog.tsx');
		const heading = viewer.slice(viewer.indexOf('id="artifact-viewer-title"') - 100);

		expect(heading).toContain('text-lg font-semibold text-foreground');
	});

	test('keeps every desktop report within a two-line identity cell', async () => {
		const reports = await detail('ReportsDesktopTable.tsx');

		expect(reports).toContain('table-fixed text-left text-sm');
		expect(reports).toContain('truncate font-medium text-foreground');
		expect(reports).toContain('truncate font-mono text-xs text-muted-foreground');
		expect(reports).not.toContain('Description\n');
	});

	test('aligns milestone rhythm, card corners and dialog prose', async () => {
		const tab = await detail('MilestonesTab.tsx');
		const dialog = await detail('MilestoneFormDialog.tsx');

		expect(tab).toContain('<div className="space-y-4">');
		expect(tab).toContain('<Card className="overflow-hidden p-0">');
		expect(dialog).toContain('text-xs text-muted-foreground ${proseMeasureClass}');
	});

	test('keeps the dependency panel outside the canvas and explains source rails', async () => {
		const tab = await detail('DependencyGraphTab.tsx');
		const components = await detail('dependencyGraphComponents.tsx');

		expect(tab).toContain('xl:grid-cols-[minmax(0,1fr)_22rem]');
		expect(tab).toContain('xl:max-h-[calc(100vh-41rem)] xl:overflow-auto');
		expect(tab).not.toContain('absolute top-3 right-3');
		expect(components).toContain('aria-label="Node source legend"');
		expect(components).toContain('bg-violet-500');
		expect(components).not.toContain('border-l-teal-500');
	});

	test('exposes diary disclosure state and one advertised Notes save state', async () => {
		const entry = await diary('DiaryEntryCard.tsx');
		const notes = await detail('NotesTab.tsx');

		expect(entry).toContain('aria-controls={detailsId}');
		expect(entry).toContain('aria-expanded={expanded}');
		expect(entry).toContain("'Read entry'}: ${entry.title}");
		expect(notes).toContain('aria-keyshortcuts="Control+S Meta+S"');
		expect(notes).toContain("keys={['Ctrl/⌘', 'S']}");
		expect(notes.match(/\{saveState\}/gu)).toHaveLength(2);
	});
});
