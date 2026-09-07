export const ALL_PROJECTS = 'all';

/** The trailing path segment, which is what an operator recognizes a project directory by. */
function pathLabel(path: string): string {
	const segments = path.replace(/\\/gu, '/').split('/').filter(Boolean);
	return segments.at(-1) ?? path;
}

/**
 * The Project options for the runs toolbar, including one for a filter value the projects list does
 * not contain.
 *
 * A native select whose `value` matches no option displays the first one instead. The first option
 * here is `All projects`, so a Director deep link carrying a synthetic project path filtered the
 * list correctly while the control beside it asserted nothing was filtering — and opening the select
 * did not reveal the applied value either, so the state was unreadable rather than merely mislabeled.
 *
 * The added option carries the filter value verbatim, so choosing `All projects` clears it through
 * the same `onChange` as any other selection and needs no separate escape hatch. It is appended
 * rather than sorted in among the real projects, because it is not one of them: the run rows are
 * filtered by a path this deployment does not list, and the label says so rather than implying the
 * project could be selected again after moving away from it.
 */
export function projectFilterOptions(
	projects: readonly { name: string; path: string }[],
	active: string,
): { label: string; value: string }[] {
	const options = [
		{ label: 'All projects', value: ALL_PROJECTS },
		...projects.map((project) => ({ label: project.name, value: project.path })),
	];
	if (active === ALL_PROJECTS || options.some((option) => option.value === active)) {
		return options;
	}
	return [...options, { label: `${pathLabel(active)} (not listed)`, value: active }];
}
