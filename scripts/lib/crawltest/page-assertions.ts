import type { WebVitalEntry } from '../../crawltest-types.ts';

export { assertAuditSidebarNavigation } from './page-assertions/audit-sidebar.ts';
export {
	assert404,
	classifyPageContent,
	clickButtonByText,
	isIgnorableConsoleError,
	isNotFoundPage,
	isProjectDetailRoute,
	NOT_FOUND_PAGE_SELECTOR,
	pageTextScript,
	shouldTestInteractions,
} from './page-assertions/core.ts';
export { assertDisabledActionAffordance } from './page-assertions/disabled-affordance.ts';

export function parseWebVitalMessage(text: string, url: string): null | WebVitalEntry {
	const prefix = '[Web Vitals] ';
	if (!text.startsWith(prefix)) return null;
	try {
		const parsed = JSON.parse(text.slice(prefix.length)) as {
			name?: unknown;
			navigationType?: unknown;
			rating?: unknown;
			value?: unknown;
		};
		if (
			typeof parsed.name !== 'string' ||
			typeof parsed.rating !== 'string' ||
			typeof parsed.value !== 'number'
		) {
			return null;
		}
		return {
			name: parsed.name,
			navigationType:
				typeof parsed.navigationType === 'string' ? parsed.navigationType : 'unknown',
			rating: parsed.rating,
			timestamp: new Date().toISOString(),
			url,
			value: parsed.value,
		};
	} catch {
		return null;
	}
}
