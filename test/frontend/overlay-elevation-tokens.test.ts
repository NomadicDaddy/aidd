import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const FRONTEND_SOURCE = resolve(import.meta.dir, '../../frontend/src');

async function readSource(path: string): Promise<string> {
	return readFile(resolve(FRONTEND_SOURCE, path), 'utf8');
}

describe('global overlay elevation tokens', () => {
	test('defines a theme-specific overlay token and exposes it to Tailwind', async () => {
		const css = await readSource('index.css');

		expect(css).toContain('--overlay: rgb(15 23 42 / 0.35);');
		expect(css).toContain('--overlay: rgb(2 6 23 / 0.7);');
		expect(css).toContain('--color-overlay: var(--overlay);');
	});

	test('keeps the canonical dialog scrim and panel on semantic theme tokens', async () => {
		const dialog = await readSource('components/ui/dialog.tsx');
		const overlayClasses = dialog.match(/const OVERLAY_BASE =\s*'([^']+)'/)?.[1];
		const panelClasses = dialog.match(/const PANEL_BASE =\s*'([^']+)'/)?.[1];

		expect(overlayClasses?.split(/\s+/)).toContain('bg-[var(--overlay)]');
		expect(overlayClasses).not.toContain('bg-slate');
		expect(panelClasses?.split(/\s+/)).toEqual(
			expect.arrayContaining(['border-border', 'bg-card/95', 'ring-ring/10']),
		);
		const panelUtilities = panelClasses?.split(/\s+/) ?? [];
		expect(
			panelUtilities.some(
				(value) =>
					value.startsWith('dark:') ||
					value.includes('-neutral-') ||
					value.includes('-slate-'),
			),
		).toBeFalse();
	});

	test('keeps raised shared overlays on the card, border, muted, and accent tokens', async () => {
		const [commandPalette, dialog, shortcutsOverlay, helpDrawer] = await Promise.all([
			readSource('components/shared/CommandPalette.tsx'),
			readSource('components/ui/dialog.tsx'),
			readSource('components/shared/ShortcutsOverlay.tsx'),
			readSource('components/shared/HelpDrawer.tsx'),
		]);

		for (const source of [dialog, shortcutsOverlay, helpDrawer]) {
			expect(source).toContain('border-border');
			expect(source).toContain('bg-card/95');
			expect(source).not.toMatch(/dark:/);
		}
		expect(commandPalette).toContain('<DialogPanel');
		expect(commandPalette).not.toMatch(/shadow-accent|ring-ring\/15/);
		expect(commandPalette).toContain('bg-muted/80');
		expect(commandPalette).toContain('text-accent');
		expect(`${commandPalette}\n${shortcutsOverlay}\n${helpDrawer}`).toContain(
			'bg-accent-muted',
		);
		expect(helpDrawer.match(/bg-muted\/80/g)?.length).toBe(2);
		expect(helpDrawer).toContain('text-accent');
	});

	test('routes every named modal through the canonical dialog overlay', async () => {
		const [authToken, directive, director, confirmDialog, alertDialog] = await Promise.all([
			readSource('components/shared/AuthTokenDialog.tsx'),
			readSource('components/shared/DirectiveLaunchModal.tsx'),
			readSource('components/shared/DirectorChatModal.tsx'),
			readSource('components/shared/ConfirmDialog.tsx'),
			readSource('components/ui/alert-dialog.tsx'),
		]);

		for (const source of [authToken, directive, director]) {
			expect(source).toContain("from '../ui/dialog.tsx'");
			expect(source).toContain('<Dialog');
		}
		expect(confirmDialog).toContain("from '../ui/alert-dialog.tsx'");
		expect(alertDialog).toContain("from './dialog.tsx'");
		expect(alertDialog).toContain('<Dialog');
		expect(alertDialog).toContain('text-muted-foreground');
	});
});
