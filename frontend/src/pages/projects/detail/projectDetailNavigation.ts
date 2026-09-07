import type { SetURLSearchParams } from 'react-router';

import { useEffect } from 'react';

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

/**
 * The tab named by the URL, with an unrecognized one removed rather than only ignored.
 *
 * readProjectDetailTab already falls back to Overview, so a stale or hand-typed value rendered the
 * right panel — but it stayed in the address bar, so the link an operator copied named a tab the
 * page was not showing. projectDetailTabSearchParams deletes the parameter for Overview rather than
 * writing it, so dropping it is what this surface's own controls would have produced.
 */
export function useProjectDetailTab(
	searchParams: URLSearchParams,
	setSearchParams: SetURLSearchParams,
): DetailTab {
	const raw = searchParams.get('tab');
	const tab = readProjectDetailTab(raw);
	useEffect(() => {
		if (raw === null || projectDetailTabIds.has(raw as DetailTab)) return;
		setSearchParams(projectDetailTabSearchParams(searchParams, 'overview'), { replace: true });
	}, [raw, searchParams, setSearchParams]);
	return tab;
}
