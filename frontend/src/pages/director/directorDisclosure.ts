import { useSyncExternalStore } from 'react';

export const MOBILE_CHAT_PREVIEW_COUNT = 3;
export const MOBILE_SUGGESTION_BATCH_SIZE = 10;
export const ALL_SUGGESTIONS = '__all__';

const MOBILE_DIRECTOR_QUERY = '(max-width: 639px)';

interface IdentifiedSession {
	id: string;
}

export interface SuggestionDisclosureState {
	riskFilter: string;
	taskFilter: string;
	visibleCount: number;
}

export type SuggestionDisclosureAction =
	| { filter: string; type: 'set-risk-filter' }
	| { filter: string; type: 'set-task-filter' }
	| { total: number; type: 'show-more' };

export const initialSuggestionDisclosureState: SuggestionDisclosureState = {
	riskFilter: ALL_SUGGESTIONS,
	taskFilter: ALL_SUGGESTIONS,
	visibleCount: MOBILE_SUGGESTION_BATCH_SIZE,
};

export function compactChatSessions<T extends IdentifiedSession>(
	sessions: readonly T[],
	activeSessionId: string | undefined,
): T[] {
	if (sessions.length <= MOBILE_CHAT_PREVIEW_COUNT) return [...sessions];
	const previewIds = new Set<string>();
	if (activeSessionId && sessions.some((session) => session.id === activeSessionId)) {
		previewIds.add(activeSessionId);
	}
	for (const session of sessions) {
		if (previewIds.size >= MOBILE_CHAT_PREVIEW_COUNT) break;
		previewIds.add(session.id);
	}
	return sessions.filter((session) => previewIds.has(session.id));
}

export function suggestionDisclosureReducer(
	state: SuggestionDisclosureState,
	action: SuggestionDisclosureAction,
): SuggestionDisclosureState {
	switch (action.type) {
		case 'set-risk-filter':
			return {
				...state,
				riskFilter: action.filter,
				visibleCount: MOBILE_SUGGESTION_BATCH_SIZE,
			};
		case 'set-task-filter':
			return {
				...state,
				taskFilter: action.filter,
				visibleCount: MOBILE_SUGGESTION_BATCH_SIZE,
			};
		case 'show-more':
			return {
				...state,
				visibleCount: Math.min(
					state.visibleCount + MOBILE_SUGGESTION_BATCH_SIZE,
					action.total,
				),
			};
	}
}

function getMobileSnapshot(): boolean {
	return window.matchMedia(MOBILE_DIRECTOR_QUERY).matches;
}

function getServerSnapshot(): boolean {
	return false;
}

function subscribeToMobileLayout(onStoreChange: () => void): () => void {
	const media = window.matchMedia(MOBILE_DIRECTOR_QUERY);
	media.addEventListener('change', onStoreChange);
	return () => media.removeEventListener('change', onStoreChange);
}

export function useDirectorMobileLayout(): boolean {
	return useSyncExternalStore(subscribeToMobileLayout, getMobileSnapshot, getServerSnapshot);
}
