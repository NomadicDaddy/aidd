export const PROJECT_DETAIL_TAB_IDS = [
	'artifacts',
	'audits',
	'code',
	'dependencies',
	'diary',
	'features',
	'history',
	'interview',
	'management',
	'milestones',
	'notes',
	'overview',
	'profile',
	'reports',
	'repository',
	'runs',
] as const;

export type DetailTab = (typeof PROJECT_DETAIL_TAB_IDS)[number];

const projectDetailTabIds = new Set<DetailTab>(PROJECT_DETAIL_TAB_IDS);

export function readProjectDetailTab(value: null | string): DetailTab {
	if (value && projectDetailTabIds.has(value as DetailTab)) return value as DetailTab;
	return 'overview';
}

export function projectDetailTabSearchParams(
	current: URLSearchParams,
	tab: DetailTab,
): URLSearchParams {
	const next = new URLSearchParams(current);
	if (tab === 'overview') next.delete('tab');
	else next.set('tab', tab);
	return next;
}
