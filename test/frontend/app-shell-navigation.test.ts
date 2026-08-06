import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { defaultCollapsedForWidth } from '../../frontend/src/stores/sidebarStore.ts';

const FRONTEND_SOURCE = resolve(import.meta.dir, '../../frontend/src');

async function readSource(path: string): Promise<string> {
	return readFile(resolve(FRONTEND_SOURCE, path), 'utf8');
}

/** Renders the two shortcut shapes the overlay lists in one column. */
function renderChords(): { held: string; sequence: string } {
	const script = String.raw`
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ShortcutChord } from './src/components/shared/KeyboardShortcut.tsx';

const render = (props) => renderToStaticMarkup(createElement(ShortcutChord, props));

console.log(
	JSON.stringify({
		held: render({ keys: ['Ctrl', 'K'] }),
		sequence: render({ keys: ['g', 'd'], sequential: true }),
	}),
);
`;
	const result = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: resolve(import.meta.dir, '../../frontend'),
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) {
		throw new Error(new TextDecoder().decode(result.stderr));
	}
	return JSON.parse(new TextDecoder().decode(result.stdout)) as {
		held: string;
		sequence: string;
	};
}

describe('shell navigation landmarks', () => {
	test('gives each navigation group its own named landmark', async () => {
		const nav = await readSource('components/layout/SidebarNav.tsx');
		const layout = await readSource('components/layout/AppLayout.tsx');

		// A single "Primary" nav announces all twelve links as one undifferentiated list, and the
		// visible group label it could point at does not exist on mobile or in the collapsed rail.
		expect(`${nav}\n${layout}`).not.toContain('aria-label="Primary"');
		expect(nav).toMatch(/<nav\s+aria-label=\{group\.label\}/);
		expect(nav).toContain('key={group.label}');
	});

	test('exposes the mobile overflow and keeps the group boundaries visible', async () => {
		const nav = await readSource('components/layout/SidebarNav.tsx');

		expect(nav).toContain(
			'max-sm:[mask-image:linear-gradient(to_right,black_calc(100%-2rem),transparent)]',
		);
		expect(nav).toContain('overflow-x-auto');
		// The divider is the group boundary on the strip, where the captions are hidden.
		expect(nav).toContain('w-px shrink-0 self-center rounded-full bg-border/60 sm:hidden');
	});

	test('renders Projects as a plain NavLink with no transparent native select', async () => {
		const nav = await readSource('components/layout/SidebarNav.tsx');
		const layout = await readSource('components/layout/AppLayout.tsx');

		expect(layout).not.toContain('ProjectsNavDropdown');
		expect(nav).not.toContain('<select');
		// Every destination comes from the one source, Projects included.
		expect(nav).toContain('navGroups.map');
	});

	test('drops the dropdown component but keeps the target helper its consumers use', async () => {
		expect(
			await Bun.file(
				resolve(FRONTEND_SOURCE, 'components/layout/ProjectsNavDropdown.tsx'),
			).exists(),
		).toBe(false);
		expect(
			await Bun.file(
				resolve(FRONTEND_SOURCE, 'components/layout/project-nav-target.ts'),
			).exists(),
		).toBe(true);
	});

	test('states what the rail toggle does instead of pulsing an unrelated glyph', async () => {
		const layout = await readSource('components/layout/AppLayout.tsx');

		expect(layout).toContain('const RailToggleIcon = collapsed ? PanelLeft : PanelLeftClose;');
		expect(layout).toContain("collapsed ? 'Expand navigation' : 'Collapse navigation'");
		expect(layout).not.toContain('icons/activity');
	});
});

describe('command palette glyph parity', () => {
	test('uses sidebar-sized glyphs on the shared semantic colors', async () => {
		const palette = await readSource('components/shared/CommandPalette.tsx');
		const nav = await readSource('components/layout/SidebarNav.tsx');

		expect(palette).toContain(
			"'h-4 w-4 shrink-0 text-muted-foreground group-data-[selected=true]:text-accent'",
		);
		// The sidebar renders its glyphs at the same size, unwrapped.
		expect(nav).toContain('<item.icon className="h-4 w-4 shrink-0" />');
		// The bordered tile is gone, along with its hard-coded light/dark accent pair.
		expect(palette).not.toContain('iconFrameClass');
		expect(palette).not.toMatch(/<span className=\{commandIconClass\}>/);
	});

	test('marks the palette row as the group the selected-state variant reads from', async () => {
		const command = await readSource('components/ui/command.tsx');

		expect(command).toContain("'group relative flex cursor-pointer");
	});
});

describe('shortcut chord separators', () => {
	const { held, sequence } = renderChords();

	test('distinguishes held keys from a key sequence', () => {
		expect(held).toContain('+');
		expect(held).not.toContain('then');
		expect(sequence).toContain('then');
		expect(sequence).not.toContain('>+<');
	});

	test('keeps both separators on the named type scale and out of the a11y tree', () => {
		expect(held).toContain('text-xs');
		expect(sequence).toContain('text-2xs');
		for (const markup of [held, sequence]) {
			expect(markup).toContain('aria-hidden="true"');
			expect(markup).not.toMatch(/text-\[0\.[0-7]\d*rem\]/);
		}
	});

	test('marks the overlay navigation shortcuts as sequential', async () => {
		const overlay = await readSource('components/shared/ShortcutsOverlay.tsx');

		expect(overlay).toContain('sequential: true');
		expect(overlay).toContain('sequential={shortcut.sequential ?? false}');
	});
});

describe('rail default for the viewport', () => {
	test('opens narrow viewports on the icon rail and wide ones labelled', () => {
		expect(defaultCollapsedForWidth(320)).toBe(true);
		expect(defaultCollapsedForWidth(768)).toBe(true);
		expect(defaultCollapsedForWidth(1023)).toBe(true);
		expect(defaultCollapsedForWidth(1024)).toBe(false);
		expect(defaultCollapsedForWidth(1440)).toBe(false);
	});

	test('seeds the store from the viewport without breaking server rendering', async () => {
		const store = await readSource('stores/sidebarStore.ts');

		expect(store).toContain(
			"typeof window === 'undefined' ? false : defaultCollapsedForWidth(window.innerWidth)",
		);
		// `persist` rehydrates after this — but only over a value the user chose. An unchosen
		// default is re-derived from the width on rehydration; see content-width-contract.test.ts.
		expect(store).toContain("name: 'aidd-sidebar',");
		expect(store).toContain('onRehydrateStorage');
	});
});

describe('shell background', () => {
	test('anchors the radial glows to the viewport in both themes', async () => {
		const css = await readSource('index.css');
		const attachments = css.match(/background-attachment: fixed;/g) ?? [];

		// One for `.app-shell`, one for `.dark .app-shell`: without this the glows are sized to the
		// document, so the 3297px Audits route renders a different composition than a short page.
		expect(attachments.length).toBe(2);
	});
});
