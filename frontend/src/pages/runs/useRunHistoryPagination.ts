import { useState } from 'react';

import type { PipelineSessionRecord, RunRecord } from '../../api/types.ts';
import type { usePipelineSessions } from '../../hooks/usePipelineSessions.ts';
import type { useRuns } from '../../hooks/useRuns.ts';
import type { UnifiedEntry, UnifiedEntryFilters } from './unifiedEntries.ts';

import { clampPage } from '../projects/detail/pagination-utils.ts';
import {
	buildUnifiedEntries,
	entryMatchesFilters,
	entryStartedAt,
	historyDisplayFloor,
	oldestStartedAt,
	splitEntriesByLiveness,
} from './unifiedEntries.ts';

export const HISTORY_PAGE_SIZE = 5;

type PipelineSessionsQuery = ReturnType<typeof usePipelineSessions>['sessions'];
type RunsQuery = ReturnType<typeof useRuns>;

function clampHistoryToLoadedWindow(
	history: UnifiedEntry[],
	runList: RunRecord[],
	sessionList: PipelineSessionRecord[],
	hasMoreRuns: boolean,
	hasMoreSessions: boolean,
): UnifiedEntry[] {
	const historyFloor = historyDisplayFloor([
		{ hasMore: hasMoreRuns, oldestLoaded: oldestStartedAt(runList) },
		{ hasMore: hasMoreSessions, oldestLoaded: oldestStartedAt(sessionList) },
	]);
	return history.filter((entry) => entryStartedAt(entry) >= historyFloor);
}

function filteredHistory(
	runList: RunRecord[],
	sessionList: PipelineSessionRecord[],
	filters: UnifiedEntryFilters,
	hasMoreRuns: boolean,
	hasMoreSessions: boolean,
): UnifiedEntry[] {
	const entries = buildUnifiedEntries(runList, sessionList).filter((entry) =>
		entryMatchesFilters(entry, filters),
	);
	return clampHistoryToLoadedWindow(
		splitEntriesByLiveness(entries).history,
		runList,
		sessionList,
		hasMoreRuns,
		hasMoreSessions,
	);
}

export function useRunHistoryPagination({
	filters,
	history,
	pipelineSessionsQuery,
	runList,
	runsQuery,
	sessionList,
}: {
	filters: UnifiedEntryFilters;
	history: UnifiedEntry[];
	pipelineSessionsQuery: PipelineSessionsQuery;
	runList: RunRecord[];
	runsQuery: RunsQuery;
	sessionList: PipelineSessionRecord[];
}) {
	const filterKey = [
		filters.initiator,
		filters.kind,
		filters.mode,
		filters.project,
		filters.query,
		filters.status,
	].join('\u0000');
	const [pagination, setPagination] = useState({ filterKey, page: 0 });
	const clampedHistory = clampHistoryToLoadedWindow(
		history,
		runList,
		sessionList,
		runsQuery.hasNextPage === true,
		pipelineSessionsQuery.hasNextPage === true,
	);
	const requestedPage = pagination.filterKey === filterKey ? pagination.page : 0;
	const historyPage = clampPage(requestedPage, clampedHistory.length, HISTORY_PAGE_SIZE);
	if (pagination.filterKey !== filterKey || pagination.page !== historyPage) {
		// Render-phase adjustment keeps filter changes and cursor refreshes from briefly rendering an
		// empty page. It also avoids an effect-driven second paint with stale pagination controls.
		setPagination({ filterKey, page: historyPage });
	}
	const historyStart = historyPage * HISTORY_PAGE_SIZE;
	const historyEntries = clampedHistory.slice(historyStart, historyStart + HISTORY_PAGE_SIZE);
	const hasMoreHistory =
		runsQuery.hasNextPage === true || pipelineSessionsQuery.hasNextPage === true;
	const isFetchingMore = runsQuery.isFetchingNextPage || pipelineSessionsQuery.isFetchingNextPage;

	function setHistoryPage(page: number): void {
		setPagination({ filterKey, page });
	}

	async function fetchNextHistoryPage(): Promise<void> {
		if (isFetchingMore || !hasMoreHistory) return;
		const nextPage = historyPage + 1;
		let nextRunList = runList;
		let nextSessionList = sessionList;
		let hasMoreRuns = runsQuery.hasNextPage === true;
		let hasMoreSessions = pipelineSessionsQuery.hasNextPage === true;
		while (hasMoreRuns || hasMoreSessions) {
			const [runResult, sessionResult] = await Promise.all([
				hasMoreRuns ? runsQuery.fetchNextPage() : Promise.resolve(undefined),
				hasMoreSessions
					? pipelineSessionsQuery.fetchNextPage()
					: Promise.resolve(undefined),
			]);
			if (runResult?.isError) {
				hasMoreRuns = false;
			} else if (runResult?.data) {
				nextRunList = runResult.data.pages.flatMap((page) => page.runs);
				hasMoreRuns = runResult.hasNextPage === true;
			} else if (runResult) {
				hasMoreRuns = false;
			}
			if (sessionResult?.isError) {
				hasMoreSessions = false;
			} else if (sessionResult?.data) {
				nextSessionList = sessionResult.data.pages.flatMap((page) => page.sessions);
				hasMoreSessions = sessionResult.hasNextPage === true;
			} else if (sessionResult) {
				hasMoreSessions = false;
			}
			const nextHistory = filteredHistory(
				nextRunList,
				nextSessionList,
				filters,
				hasMoreRuns,
				hasMoreSessions,
			);
			if (nextHistory.length > nextPage * HISTORY_PAGE_SIZE) break;
		}
		setHistoryPage(nextPage);
	}

	return {
		fetchNextHistoryPage,
		hasMoreHistory,
		historyEntries,
		historyPage,
		historyTotal: clampedHistory.length,
		isFetchingMore,
		setHistoryPage,
	};
}
