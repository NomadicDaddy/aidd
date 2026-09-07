import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const frontendSource = join(process.cwd(), 'frontend', 'src');

function read(relativePath: string): Promise<string> {
	return readFile(join(frontendSource, ...relativePath.split('/')), 'utf8');
}

// Every rail listed here is itself a grid item. Grid items default to `align-self: stretch`, which
// leaves position: sticky nothing to slide within, so these pair sticky with self-start. Profile's
// sticky element is a child of the grid item and is checked separately below.
const stickyRails = [
	// Docs gates its split on the region's own width rather than the viewport tier, so the pairing
	// this suite exists to enforce is scoped to the container query instead of to `lg`. The rule is
	// unchanged: a grid item that declares sticky at a condition needs self-start at the same one.
	['pages/docs/DocsNavigationRail.tsx', '@min-[45rem]:sticky', '@min-[45rem]:self-start'],
	// Same move as Docs: the runs split now gates on the content column's own width, so the sticky
	// declaration moved with it. `self-start` here is unconditional — the console column is the one
	// item that must never stretch, at any width.
	['pages/runs/RunsPage.tsx', '@min-[88.375rem]:sticky', 'self-start'],
] as const;

describe('declared sticky rails actually stick', () => {
	test('pairs every breakpoint-scoped sticky rail with a self-start', async () => {
		for (const [relativePath, stickyClass, alignClass] of stickyRails) {
			const source = await read(relativePath);

			expect(source).toContain(stickyClass);
			expect(source).toContain(alignClass);
		}
	});

	test('keeps the profile rail inside the viewport', async () => {
		const source = await read('pages/projects/detail/profile/ComputedProfilePanel.tsx');

		// The rail shares the shell-published offset with the editor action bar. Its wrapper, not the
		// sticky element, is the grid item, so self-start would be inert here. The audit scrollport
		// uses its measured fill height instead of removing the cap at this breakpoint.
		expect(source).toContain('lg:top-[var(--app-topbar-height,0px)]');
		expect(source).toContain('lg:max-h-[calc(100dvh-var(--app-topbar-height,0px)-2rem)]');
		expect(source).not.toContain('lg:self-start');
		expect(source).toContain('lg:max-h-[var(--fill-height)] lg:min-h-0 lg:flex-1');
	});

	test('commits the profile from the editor column, not the rail beside it', async () => {
		// Save/Discard do not ride this rail. `project-detail-polish` guards the action bar's
		// destination in the editor column; this guards that the rail does not quietly take it.
		const rail = await read('pages/projects/detail/profile/ComputedProfilePanel.tsx');

		expect(rail).not.toContain('Save profile');
	});
});
