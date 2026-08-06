import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const frontendSource = join(process.cwd(), 'frontend', 'src');

function read(relativePath: string): Promise<string> {
	return readFile(join(frontendSource, ...relativePath.split('/')), 'utf8');
}

// Every rail in the app that declares `sticky` at a breakpoint is a grid item. Grid items default
// to `align-self: stretch`, which sizes the box to the full row and leaves position: sticky nothing
// to slide within — the declaration compiles, renders, and does nothing. Each of these must pair
// its sticky declaration with a self-start so the rail is shorter than the row it scrolls beside.
const stickyRails = [
	['pages/projects/detail/profile/ComputedProfilePanel.tsx', 'lg:sticky', 'lg:self-start'],
	['pages/docs/DocsPage.tsx', 'lg:sticky', 'lg:self-start'],
	['pages/runs/RunsPage.tsx', '2xl:sticky', 'self-start'],
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

		// Capping the rail at viewport height is what keeps a long audit catalog from pushing the
		// rail past the fold; the audit list flexes and scrolls to absorb the overflow instead.
		expect(source).toContain('lg:max-h-[calc(100dvh-2rem)]');
		expect(source).toContain('lg:max-h-none lg:min-h-0 lg:flex-1');
	});

	test('commits the profile from the foot of the form, not the rail beside it', async () => {
		// Save/Reset used to ride this rail, which is two cards shorter than the form column — so
		// the commit action sat level with the third facet, three cards of unread fields above the
		// bottom of what it commits. `project-detail-polish` guards the destination; this guards
		// that the rail did not quietly take it back.
		const rail = await read('pages/projects/detail/profile/ComputedProfilePanel.tsx');

		expect(rail).not.toContain('Save profile');
	});
});
