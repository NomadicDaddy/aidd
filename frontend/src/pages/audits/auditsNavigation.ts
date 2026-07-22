import type { AuditsTab } from './auditsUtils.ts';

const auditTabIds = new Set<AuditsTab>(['applicability', 'catalog', 'overrides']);

export function readAuditsTab(value: null | string): AuditsTab {
	if (value && auditTabIds.has(value as AuditsTab)) return value as AuditsTab;
	return 'catalog';
}

export function auditsTabSearchParams(current: URLSearchParams, tab: AuditsTab): URLSearchParams {
	const next = new URLSearchParams(current);
	if (tab === 'catalog') next.delete('tab');
	else next.set('tab', tab);
	return next;
}
