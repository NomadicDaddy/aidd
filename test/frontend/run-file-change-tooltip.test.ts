import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
	buildRunFileChangeTooltipModel,
	fileChangeSourceNote,
	fileChangeTelemetryNote,
} from '../../frontend/src/pages/runs/runFileChangeTooltip.ts';

describe('run file change tooltip model', () => {
	test('keeps the trigger inline while the shared surface holds block content', async () => {
		const tooltip = await readFile(
			resolve(import.meta.dir, '../../frontend/src/components/ui/tooltip.tsx'),
			'utf8',
		);
		const chip = await readFile(
			resolve(import.meta.dir, '../../frontend/src/pages/runs/RunFileChangeChip.tsx'),
			'utf8',
		);

		expect(tooltip).toContain('const tooltipRef = useRef<HTMLDivElement | null>(null);');
		expect(tooltip).toContain("'relative inline-flex max-w-full min-w-0'");
		expect(tooltip).toContain('pointer-events-none fixed z-[1000] block w-max rounded-md');
		expect(tooltip).toContain('maxWidth: safeMaxWidth');
		expect(tooltip).toMatch(/createPortal\(\s*<div/u);
		expect(chip).toContain('disclosure');
		expect(chip).toContain(
			"disclosureLabel={`${kind === 'created' ? 'Created' : 'Edited'} file paths and recording details`}",
		);
	});

	test('shows path text and ledger source copy for edited files', () => {
		const model = buildRunFileChangeTooltipModel({
			kind: 'edited',
			paths: ['.aidd/features/example/feature.json'],
			source: 'ledger',
			truncated: false,
		});

		expect(model.title).toBe('Edited files');
		expect(model.paths).toEqual(['.aidd/features/example/feature.json']);
		expect(model.sourceNote).toBe('Recorded in run ledger.');
		expect(model.countNote).toBe(fileChangeTelemetryNote);
		expect(model.truncatedNote).toBeNull();
	});

	test('shows unavailable copy when counts exist without recorded paths', () => {
		const model = buildRunFileChangeTooltipModel({
			kind: 'created',
			paths: [],
			source: 'unavailable',
			truncated: false,
		});

		expect(model.title).toBe('Created files');
		expect(model.sourceNote).toBe('Path list not recorded for this run.');
		expect(model.paths).toEqual([]);
	});

	test('returns iteration artifact source copy and truncation note', () => {
		const model = buildRunFileChangeTooltipModel({
			kind: 'edited',
			paths: ['.aidd/CHANGELOG.md'],
			source: 'iteration-artifacts',
			truncated: true,
		});

		expect(fileChangeSourceNote('iteration-artifacts')).toBe(
			'Recovered from iteration artifacts.',
		);
		expect(model.truncatedNote).toBe('Showing first 50 paths.');
	});
});
