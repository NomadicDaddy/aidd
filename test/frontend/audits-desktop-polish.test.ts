import { describe, expect, test } from 'bun:test';
import { join, resolve } from 'node:path';

import { resolveMatrixCellFocus } from '../../frontend/src/pages/audits/tabs/matrixNavigation.ts';
import { groupEquivalentBuckets } from '../../frontend/src/pages/audits/tabs/matrixBucketGroups.ts';

const TABS = resolve(import.meta.dir, '../../frontend/src/pages/audits/tabs');
const SHARED = resolve(import.meta.dir, '../../frontend/src/components/shared');

function read(file: string): Promise<string> {
	return Bun.file(join(TABS, file)).text();
}

function stripComments(source: string): string {
	return source.replaceAll(/\/\*[\s\S]*?\*\//g, '').replaceAll(/\/\/[^\n]*/g, '');
}

describe('the audit catalog gives rows and their editor one coherent page', () => {
	test('keeps the catalog in page flow instead of nesting a short vertical scrollport', async () => {
		const table = await read('CatalogTable.tsx');

		expect(table).toContain('ariaLabel="Audit catalog"');
		expect(table).toContain('group-data-[overflow-end=false]:overflow-visible');
		expect(table).not.toContain('useViewportFill<HTMLDivElement>');
		expect(table).not.toContain('scrollerClassName={viewportFillScrollerClass}');
	});

	test('lets compact data columns collapse and gives spare width to the audit id', async () => {
		const table = stripComments(await read('CatalogTable.tsx'));

		expect(table).toContain('contentSizedTableClass');
		expect(table).toContain('contentSizedColumnClass');
		expect(table).not.toContain('max-w-[18rem]');
	});

	test('bounds the whole definition card to the mono editor measure', async () => {
		const editor = stripComments(await read('AuditDefinitionEditor.tsx'));

		expect(editor).toContain('monoEditorMeasureCardClass');
		expect(editor).toContain('flex flex-col gap-3 ${monoEditorMeasureCardClass}');
		expect(editor).toContain('monoTextareaClass');
		expect(editor).not.toContain('monoEditorMeasureClass');
	});

	test('uses one filter and launch card with one primary run action', async () => {
		const targets = stripComments(await read('LaunchTargetsCard.tsx'));
		const toolbar = stripComments(await read('CatalogToolbar.tsx'));

		expect((toolbar.match(/<FilterToolbar/g) ?? []).length).toBe(1);
		expect(toolbar).toContain('actions={');
		expect(toolbar).toContain('header={launchTargets}');
		expect(toolbar).toMatch(/onRun\(false, undefined, runTarget\)[\s\S]*?variant="primary"/u);
		expect(targets).not.toContain('Run Selected, Run All, and Review launch');
		expect(targets).toContain('Checked projects are shared by the Run and Review controls.');
	});
});

describe('the applicability matrix is compact and keyboard-navigable', () => {
	test('folds the explanation, legend and global edit action into one toolbar header', async () => {
		const tab = stripComments(await read('ApplicabilityTab.tsx'));

		expect(tab).not.toContain('<TabIntro');
		expect(tab).toContain('Cells show the strictest effect');
		expect(tab).not.toContain('${proseMeasureClass}');
		expect(tab).toContain('max-w-[68ch]');
		expect(tab).toContain('<MatrixLegend />');
		expect(tab).toContain('groupEquivalentBuckets');
		expect(tab).toContain('Edit Global Mapping');
	});

	test('groups only adjacent buckets with identical effect and provenance', () => {
		const cell = (effect: 'default' | 'required', source: 'default' | 'global-rule') => ({
			applies: true,
			effect,
			source,
		});
		const rows = [
			{
				auditName: 'TEST',
				byBucket: {
					critical_regulated: cell('required', 'global-rule'),
					internet_single_org: cell('required', 'global-rule'),
					multi_user_local: cell('default', 'default'),
					private_team: cell('required', 'global-rule'),
					prototype_archive: cell('default', 'default'),
					public_multi_tenant: cell('required', 'global-rule'),
					single_user_local: cell('default', 'default'),
				},
			},
		];
		const groups = groupEquivalentBuckets(rows, [
			'prototype_archive',
			'single_user_local',
			'multi_user_local',
			'private_team',
			'internet_single_org',
			'public_multi_tenant',
			'critical_regulated',
		]);

		expect(groups.map((group) => group.buckets)).toEqual([
			['prototype_archive', 'single_user_local', 'multi_user_local'],
			['private_team', 'internet_single_org', 'public_multi_tenant', 'critical_regulated'],
		]);
	});

	test('exposes one roving entry point and arrow-key grid semantics', async () => {
		const tab = stripComments(await read('ApplicabilityTab.tsx'));

		expect(tab).toContain('role="grid"');
		expect(tab).toContain('role="gridcell"');
		expect(tab).toMatch(/matrixCellId\([\s\S]*?'desktop'/);
		expect(tab).toContain("matrixCellId(rowIndex, columnIndex, 'mobile')");
		expect(tab).toContain('tabIndex={');
		expect(tab).toContain('onMatrixCellKeyDown');
	});

	test('lets an odd final bucket group occupy the full mobile card row', async () => {
		const tab = stripComments(await read('ApplicabilityTab.tsx'));

		expect(tab).toContain('bucketGroups.length % 2 === 1');
		expect(tab).toContain("? 'col-span-2'");
	});

	test('moves within bounds without wrapping or consuming unrelated keys', () => {
		expect(resolveMatrixCellFocus({ column: 2, row: 3 }, 'ArrowDown', 5, 4)).toEqual({
			column: 2,
			row: 4,
		});
		expect(resolveMatrixCellFocus({ column: 0, row: 0 }, 'ArrowLeft', 5, 4)).toEqual({
			column: 0,
			row: 0,
		});
		expect(resolveMatrixCellFocus({ column: 2, row: 3 }, 'Home', 5, 4)).toEqual({
			column: 0,
			row: 3,
		});
		expect(resolveMatrixCellFocus({ column: 2, row: 3 }, 'Tab', 5, 4)).toBeUndefined();
	});
});

describe('project override actions have intrinsic, visible control chrome', () => {
	test('keeps Save Overrides at its label width', async () => {
		const tab = await read('OverridesTab.tsx');
		const bar = await Bun.file(join(SHARED, 'CommitBar.tsx')).text();

		// The Save left the header grid, where `justify-self-end` was what stopped its track
		// from stretching it, and moved into the commit strip, where it sits in a flex group
		// that has no stretching to undo. Same property, held by the layout rather than by an
		// override on the button.
		expect(tab).toContain('saveLabel="Save Overrides"');
		expect(tab).not.toContain('justify-self-end');
		expect(bar).toContain('flex shrink-0 items-center gap-2');
	});

	test('uses the canonical bordered select instead of a hover-only boundary', async () => {
		const list = stripComments(await read('OverridesList.tsx'));

		expect(list).toContain('selectClass');
		expect(list).not.toContain('quietSelectClass');
	});
});
