import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { resolveColumnChooserPlacement } from '../../frontend/src/components/shared/columnChooserPlacement.ts';

const chooserPath = join(
	import.meta.dir,
	'..',
	'..',
	'frontend',
	'src',
	'components',
	'shared',
	'ColumnChooser.tsx',
);

describe('column chooser overlay layering', () => {
	test('portals the panel outside animated page stacking contexts', async () => {
		const chooser = await readFile(chooserPath, 'utf8');

		expect(chooser).toContain("import { createPortal } from 'react-dom';");
		expect(chooser).toContain('document.body');
		expect(chooser).toContain('className="fixed z-50');
		expect(chooser).not.toContain('className="absolute top-full');
	});

	test('dismisses from outside pointer input and global Escape with a visible layer edge', async () => {
		const chooser = await readFile(chooserPath, 'utf8');

		expect(chooser).toContain("document.addEventListener('pointerdown', handlePointerDown)");
		expect(chooser).toContain("window.addEventListener('keydown', handleEscape)");
		expect(chooser).toContain("document.removeEventListener('pointerdown', handlePointerDown)");
		expect(chooser).toContain("window.removeEventListener('keydown', handleEscape)");
		expect(chooser).toContain('border border-control-border bg-card');
	});

	test('right-aligns below the trigger when the panel fits', () => {
		expect(
			resolveColumnChooserPlacement(
				{ bottom: 120, left: 900, right: 1000, top: 80 },
				{ height: 240, width: 256 },
				{ height: 900, width: 1440 },
			),
		).toEqual({ left: 744, top: 124 });
	});

	test('clamps at the viewport edge and flips above a low trigger', () => {
		expect(
			resolveColumnChooserPlacement(
				{ bottom: 880, left: 12, right: 112, top: 840 },
				{ height: 240, width: 256 },
				{ height: 900, width: 1440 },
			),
		).toEqual({ left: 8, top: 596 });
	});
});
