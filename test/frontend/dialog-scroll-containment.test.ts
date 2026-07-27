import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const DIALOG_SOURCE = resolve(import.meta.dir, '../../frontend/src/components/ui/dialog.tsx');

describe('shared dialog scroll containment', () => {
	test('keeps vertical scrolling and overscroll containment on the shared overlay', async () => {
		const source = await readFile(DIALOG_SOURCE, 'utf8');
		const overlayClasses = source.match(/const OVERLAY_BASE =\s*'([^']+)'/)?.[1];

		expect(overlayClasses?.split(/\s+/)).toEqual(
			expect.arrayContaining(['overflow-y-auto', 'overscroll-contain']),
		);
		expect(source).toContain('className={cn(OVERLAY_BASE, overlayClassName)}');
	});
});
