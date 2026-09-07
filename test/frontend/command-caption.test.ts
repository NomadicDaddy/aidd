import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const FRONTEND_SOURCE = resolve(import.meta.dir, '../../frontend/src');

async function readSource(path: string): Promise<string> {
	return readFile(resolve(FRONTEND_SOURCE, path), 'utf8');
}

async function readSectionCaptionUtilities(): Promise<string[]> {
	const typography = await readSource('lib/typography.ts');
	const declared = typography.match(/export const sectionCaptionClass =\s*'([^']+)'/)?.[1];

	expect(declared).toBeDefined();
	return (declared ?? '').split(/\s+/).filter(Boolean);
}

async function readCommandGroupCaptionUtilities(): Promise<string[]> {
	const typography = await readSource('lib/typography.ts');
	const declared = typography.match(
		/export const commandGroupSectionCaptionClass =\s*'([^']+)'/,
	)?.[1];

	expect(declared).toBeDefined();
	return [...(declared ?? '').matchAll(/\[&_\[cmdk-group-heading\]\]:([\w./[\]-]+)/g)].map(
		(match) => match[1] ?? '',
	);
}

describe('shared section caption', () => {
	test('names the caption style once, on the type scale', async () => {
		const utilities = await readSectionCaptionUtilities();

		expect(utilities).toEqual(
			expect.arrayContaining([
				'text-xs',
				'font-semibold',
				'tracking-wider',
				'text-muted-foreground',
				'uppercase',
			]),
		);
		expect(utilities.some((utility) => utility.includes('['))).toBe(false);
	});

	test('restates exactly those utilities behind the cmdk heading variant', async () => {
		const utilities = await readSectionCaptionUtilities();
		const captionVariants = await readCommandGroupCaptionUtilities();
		const command = await readSource('components/ui/command.tsx');
		const layoutVariants = [
			...command.matchAll(/\[&_\[cmdk-group-heading\]\]:([\w./[\]-]+)/g),
		].map((match) => match[1] ?? '');

		// cmdk owns the heading element, so the shared string cannot be applied to it directly —
		// the projection remains a copy for Tailwind, but it lives beside the sanctioned role rather
		// than being re-spelled inside the component.
		expect(captionVariants.sort()).toEqual(utilities.sort());
		expect(command).toContain('commandGroupSectionCaptionClass');
		// Spacing and sticky overflow orientation remain the palette's own.
		expect(layoutVariants.sort()).toEqual([
			'backdrop-blur-sm',
			'bg-card/95',
			'px-2',
			'py-1.5',
			'sticky',
			'top-0',
			'z-10',
		]);
	});

	test('uses the shared caption on the shell rail and the shortcuts overlay', async () => {
		const [nav, overlay] = await Promise.all([
			readSource('components/layout/SidebarNav.tsx'),
			readSource('components/shared/ShortcutsOverlay.tsx'),
		]);

		for (const source of [nav, overlay]) {
			expect(source).toContain("from '../../lib/typography.ts'");
			expect(source).toContain('sectionCaptionClass');
		}
	});
});

describe('micro-type scale', () => {
	test('defines the sub-`text-xs` step as a named token', async () => {
		const css = await readSource('index.css');

		expect(css).toContain('--text-2xs: 0.6875rem;');
		expect(css).toContain('--text-2xs--line-height: 1rem;');
	});

	// 0.0–0.79rem: everything at or below `text-xs`, which is where the shell's one-off sizes
	// (0.62/0.65/0.7rem) collected. Larger arbitrary sizes are other surfaces' findings.
	const arbitraryMicroType = /text-\[0\.[0-7]\d*rem\]/;

	test('leaves no arbitrary micro-type on the shell surfaces', async () => {
		const sources = await Promise.all(
			[
				'components/layout/AppLayout.tsx',
				'components/layout/SidebarNav.tsx',
				'components/layout/DirectiveLaunchButton.tsx',
				'components/shared/CommandPalette.tsx',
				'components/shared/KeyboardShortcut.tsx',
				'components/shared/ShortcutsOverlay.tsx',
				'components/ui/command.tsx',
			].map(readSource),
		);

		for (const source of sources) {
			expect(source).not.toMatch(arbitraryMicroType);
		}
	});

	test('puts the keycaps and the run-count chip on the named step', async () => {
		const [shortcut, layout, nav, command] = await Promise.all([
			readSource('components/shared/KeyboardShortcut.tsx'),
			readSource('components/layout/AppLayout.tsx'),
			readSource('components/layout/SidebarNav.tsx'),
			readSource('components/ui/command.tsx'),
		]);

		expect(shortcut).toContain('font-mono text-2xs');
		expect(layout).toContain('text-2xs');
		expect(nav).toContain('px-1 text-2xs font-bold');
		expect(command).toContain('text-2xs');
	});
});
