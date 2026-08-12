import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const frontendSource = join(process.cwd(), 'frontend', 'src');

async function read(...segments: string[]): Promise<string> {
	return readFile(join(frontendSource, ...segments), 'utf8');
}

describe('container-aware page header actions', () => {
	test('keeps Projects labels and the complete action run intact', async () => {
		const [actions, page] = await Promise.all([
			read('pages', 'projects', 'ProjectsPageActions.tsx'),
			read('pages', 'projects', 'ProjectsPage.tsx'),
		]);

		expect(page).toMatch(/<PageHeader[\s\S]*?<DataFreshness[\s\S]*?<ProjectsPageActions/);
		expect(page).toContain('<div className="flex flex-wrap items-center gap-1">');
		expect(page).toMatch(/<DataFreshness\s+className="gap-1"/);
		expect(actions).toContain('flex flex-nowrap items-center gap-1');
		expect(actions).toContain('New Project');
		expect(actions).toContain('Import Existing');
		expect(actions).toContain('Profile Matrix');
		expect(actions).toContain('ariaLabel="Project view"');
	});

	test('uses the Profile Matrix breadcrumb as the sole mobile return path', async () => {
		const page = await read('pages', 'projects', 'profileMatrix', 'ProfileMatrixPage.tsx');
		const modeAt = page.indexOf('ariaLabel="Profile matrix columns"');
		const freshnessAt = page.indexOf('<DataFreshness', modeAt);
		const projectsAt = page.indexOf("buttonClassName('secondary', 'hidden sm:inline-flex')");
		const saveAt = page.indexOf('Save all changed', projectsAt);

		expect(page).toContain('flex flex-wrap items-center gap-x-2 gap-y-1');
		expect(page).toContain('className={`hover:underline ${touchTargetTextClass}`}');
		expect(modeAt).toBeGreaterThan(-1);
		expect(freshnessAt).toBeGreaterThan(modeAt);
		expect(projectsAt).toBeGreaterThan(freshnessAt);
		expect(saveAt).toBeGreaterThan(projectsAt);
	});
});
