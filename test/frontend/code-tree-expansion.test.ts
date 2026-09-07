import { describe, expect, test } from 'bun:test';

import {
	ancestorDirs,
	type DirExpansionOverrides,
	isDirExpanded,
	revealSelection,
	toggleDir,
} from '../../frontend/src/pages/projects/detail/codeTreeExpansion.ts';

const none: DirExpansionOverrides = new Map();

describe('ancestorDirs', () => {
	test('returns the directories containing a nested file, shallowest first', () => {
		expect(ancestorDirs('entries/2007/03/19.md')).toEqual([
			'entries',
			'entries/2007',
			'entries/2007/03',
		]);
	});

	test('returns nothing for a root-level file or no selection', () => {
		expect(ancestorDirs('README.md')).toEqual([]);
		expect(ancestorDirs(null)).toEqual([]);
	});
});

describe('isDirExpanded', () => {
	const selectedAncestors = new Set(ancestorDirs('entries/2007/03/19.md'));

	test('directories default to collapsed', () => {
		expect(isDirExpanded('src', none, selectedAncestors, false)).toBe(false);
	});

	test('directories leading to the selected file default to open', () => {
		expect(isDirExpanded('entries', none, selectedAncestors, false)).toBe(true);
		expect(isDirExpanded('entries/2007/03', none, selectedAncestors, false)).toBe(true);
	});

	test('an active search keeps every directory open', () => {
		const collapsed = new Map([['entries', false]]);
		expect(isDirExpanded('src', collapsed, selectedAncestors, true)).toBe(true);
		expect(isDirExpanded('entries', collapsed, selectedAncestors, true)).toBe(true);
	});
});

describe('toggleDir', () => {
	const selectedAncestors = new Set(ancestorDirs('entries/2007/03/19.md'));

	test('collapses a folder held open by the selected file (reported bug)', () => {
		// The bug: with entries/2007/03/19.md selected, clicking `entries` did nothing because
		// the selection default always won. The first click must collapse it.
		const afterClick = toggleDir('entries', none, selectedAncestors);
		expect(isDirExpanded('entries', afterClick, selectedAncestors, false)).toBe(false);
	});

	test('reopens a collapsed selected-file ancestor on the next click', () => {
		const collapsed = toggleDir('entries', none, selectedAncestors);
		const reopened = toggleDir('entries', collapsed, selectedAncestors);
		expect(isDirExpanded('entries', reopened, selectedAncestors, false)).toBe(true);
	});

	test('opens and closes an ordinary folder', () => {
		const opened = toggleDir('src', none, selectedAncestors);
		expect(isDirExpanded('src', opened, selectedAncestors, false)).toBe(true);
		const closed = toggleDir('src', opened, selectedAncestors);
		expect(isDirExpanded('src', closed, selectedAncestors, false)).toBe(false);
	});
});

describe('revealSelection', () => {
	test('drops collapse overrides on the new selection ancestors so the file is revealed', () => {
		const overrides: DirExpansionOverrides = new Map([
			['docs', false],
			['entries', false],
			['entries/2007', false],
		]);
		const revealed = revealSelection(overrides, 'entries/2007/03/19.md');
		const selectedAncestors = new Set(ancestorDirs('entries/2007/03/19.md'));
		expect(isDirExpanded('entries', revealed, selectedAncestors, false)).toBe(true);
		expect(isDirExpanded('entries/2007', revealed, selectedAncestors, false)).toBe(true);
		// Unrelated collapse choices survive the selection change.
		expect(revealed.get('docs')).toBe(false);
	});

	test('keeps explicit opens and returns the same map when nothing blocks the selection', () => {
		const overrides: DirExpansionOverrides = new Map([['src', true]]);
		expect(revealSelection(overrides, 'entries/2007/03/19.md')).toBe(overrides);
	});
});
