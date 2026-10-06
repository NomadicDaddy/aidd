import type { DiaryKindFilter } from './diaryFilters.ts';

export interface DiaryTimelineColumns {
	kind: boolean;
	project: boolean;
	status: boolean;
}

export function diaryTimelineColumns(
	kindFilter: DiaryKindFilter,
	showProject: boolean,
): DiaryTimelineColumns {
	return {
		kind: kindFilter === 'all',
		project: showProject,
		status: kindFilter !== 'release',
	};
}

export function diaryTimelineGridColumns(columns: DiaryTimelineColumns): string {
	return [
		...(columns.kind ? ['minmax(4rem,max-content)'] : []),
		...(columns.status ? ['minmax(6rem,max-content)'] : []),
		...(columns.project ? ['12rem'] : []),
		'minmax(0,1fr)',
		'auto',
	].join(' ');
}
