import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

import {
	ALL_PROJECTS,
	projectFilterOptions,
} from '../../frontend/src/pages/runs/projectFilterOptions.ts';

const FRONTEND_SRC = resolve(import.meta.dir, '../../frontend/src');

const PROJECTS = [
	{ name: 'aidd', path: 'D:/applications/aidd' },
	{ name: 'spernakit', path: 'D:/applications/spernakit' },
];

async function frontendSource(file: string): Promise<string> {
	return await Bun.file(resolve(FRONTEND_SRC, file)).text();
}

function values(active: string): string[] {
	return projectFilterOptions(PROJECTS, active).map((option) => option.value);
}

function labelFor(active: string): string {
	const option = projectFilterOptions(PROJECTS, active).find((entry) => entry.value === active);
	return option?.label ?? '';
}

// The defect: a native select whose value matches no option displays the first one instead. The
// first option is All projects, so a Director deep link carrying a project path outside the list
// filtered the run rows correctly while the control beside them said nothing was filtering — and
// opening the select did not show the applied value either.
describe('the Project select can represent a filter value the projects list does not carry', () => {
	test('an unlisted value gets an option, and it is the one the control resolves to', () => {
		const unlisted = 'D:/applications/director-synthetic';

		expect(values(unlisted)).toEqual([
			ALL_PROJECTS,
			'D:/applications/aidd',
			'D:/applications/spernakit',
			unlisted,
		]);
		// The option carries the filter value verbatim. That is what makes the select resolve to it
		// rather than to All projects, and it is asserted here rather than inferred from the label.
		expect(values(unlisted)).toContain(unlisted);
		expect(labelFor(unlisted)).toBe('director-synthetic (not listed)');
	});

	test('the same holds for a project that has since been removed, not only Director paths', () => {
		// Nothing about the rule is Director-specific: the trigger is a value absent from the list.
		expect(values('D:/applications/deleted-app')).toContain('D:/applications/deleted-app');
		expect(labelFor('D:/applications/deleted-app')).toBe('deleted-app (not listed)');
		// A trailing separator still names the directory rather than falling back to the raw path.
		expect(labelFor('D:/applications/deleted-app/')).toBe('deleted-app (not listed)');
		expect(labelFor('D:\\applications\\windows-style')).toBe('windows-style (not listed)');
	});

	test('a listed value and the no-filter value add nothing', () => {
		// Stated from the other side. An option list that always appended would show a duplicate
		// entry for every ordinary selection, which the assertions above would not have caught.
		expect(values(ALL_PROJECTS)).toEqual([
			ALL_PROJECTS,
			'D:/applications/aidd',
			'D:/applications/spernakit',
		]);
		expect(values('D:/applications/aidd')).toEqual([
			ALL_PROJECTS,
			'D:/applications/aidd',
			'D:/applications/spernakit',
		]);
		expect(projectFilterOptions([], ALL_PROJECTS)).toEqual([
			{ label: 'All projects', value: ALL_PROJECTS },
		]);
	});

	test('clearing the filter from the control removes the URL parameter', async () => {
		// The added option is a value, not a mode, so it clears through the same onChange as any
		// other selection: choosing All projects sets 'all', and the params effect writes no key
		// for 'all'. Asserted at the source, because it is the half of the contract that lives in
		// the hook rather than in the option list.
		const hook = await frontendSource('pages/runs/useRunsPage.ts');
		expect(hook).toContain(
			"if (filterState.historyProject !== 'all') next.set('project', filterState.historyProject);",
		);
		expect(hook).toContain("searchParams.get('project') ?? 'all'");

		const filters = await frontendSource('pages/runs/RunFilters.tsx');
		expect(filters).toContain('options={projectFilterOptions(projects, historyProject)}');
		// The inline list this replaced could not see the active value at all.
		expect(filters).not.toContain("{ label: 'All projects', value: 'all' },");
	});
});
