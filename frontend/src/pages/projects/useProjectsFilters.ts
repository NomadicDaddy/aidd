import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';

import type {
	ProjectDiscoverySkippedRoot,
	ProjectGitStatusMapEntry,
	ProjectPhase,
	ProjectSummary,
	ProjectSyncState,
} from '../../api/types.ts';

import { usePrefsStore } from '../../stores/prefsStore.ts';
import {
	MATURITY_FILTERS,
	type MaturityFilter,
	PHASES,
	SYNC_STATES,
} from './projects-list-shared.ts';
import {
	compareProjects,
	DEFAULT_SORT,
	DEFAULT_SORT_DIR,
	readSortDir,
	readSortKey,
	type SortKey,
} from './projects-list-sort.ts';

const FILTER_KEYS = ['q', 'root', 'milestone', 'sync', 'phase', 'maturity', 'sort', 'dir'] as const;

function compactRootLabel(path: string, segmentCount = 1): string {
	const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '');
	const parts = normalized.split('/').filter(Boolean);
	return parts.slice(-segmentCount).join('/') || path;
}

export function useProjectsPageFilters(
	allProjects: ProjectSummary[],
	skippedRoots: ProjectDiscoverySkippedRoot[],
	gitStatus?: Record<string, ProjectGitStatusMapEntry>,
) {
	const [searchParams, setSearchParams] = useSearchParams();
	const projectsFilters = usePrefsStore((state) => state.projectsFilters);
	const setProjectsFilters = usePrefsStore((state) => state.setProjectsFilters);
	const resetProjectsFilters = usePrefsStore((state) => state.resetProjectsFilters);
	const hydratedRef = useRef(false);

	useEffect(() => {
		if (hydratedRef.current) return;
		hydratedRef.current = true;
		const hasUrlFilters = FILTER_KEYS.some((key) => searchParams.has(key));
		if (hasUrlFilters) return;
		const next = new URLSearchParams();
		for (const key of FILTER_KEYS) {
			const value = projectsFilters[key];
			if (value) next.set(key, value);
		}
		if (Array.from(next.keys()).length > 0) {
			setSearchParams(next, { replace: true });
		}
	}, [projectsFilters, searchParams, setSearchParams]);

	useEffect(() => {
		setProjectsFilters({
			dir: searchParams.get('dir') ?? '',
			maturity: searchParams.get('maturity') ?? '',
			milestone: searchParams.get('milestone') ?? '',
			phase: searchParams.get('phase') ?? '',
			q: searchParams.get('q') ?? '',
			root: searchParams.get('root') ?? '',
			sort: searchParams.get('sort') ?? '',
			sync: searchParams.get('sync') ?? '',
		});
	}, [searchParams, setProjectsFilters]);

	const query = searchParams.get('q') ?? '';
	const rootFilterRaw = searchParams.get('root') ?? 'all';
	const milestoneFilter = searchParams.get('milestone') ?? 'all';
	const syncFilterRaw = searchParams.get('sync') ?? 'all';
	const phaseFilterRaw = searchParams.get('phase') ?? 'all';
	const syncFilter: 'all' | ProjectSyncState = (SYNC_STATES as Set<string>).has(syncFilterRaw)
		? (syncFilterRaw as ProjectSyncState)
		: 'all';
	const phaseFilter: 'all' | ProjectPhase = (PHASES as Set<string>).has(phaseFilterRaw)
		? (phaseFilterRaw as ProjectPhase)
		: 'all';
	const maturityFilterRaw = searchParams.get('maturity') ?? 'all';
	const maturityFilter: MaturityFilter = (MATURITY_FILTERS as Set<string>).has(maturityFilterRaw)
		? (maturityFilterRaw as MaturityFilter)
		: 'all';
	const sortKey = readSortKey(searchParams.get('sort'));
	const sortDir = readSortDir(searchParams.get('dir'));

	function updateParam(key: string, value: null | string) {
		const next = new URLSearchParams(searchParams);
		if (value === null || value === '' || value === 'all') {
			next.delete(key);
		} else {
			next.set(key, value);
		}
		setSearchParams(next, { replace: true });
	}

	function resetFilters() {
		const next = new URLSearchParams();
		if (sortKey !== DEFAULT_SORT) next.set('sort', sortKey);
		if (sortDir !== DEFAULT_SORT_DIR) next.set('dir', sortDir);
		setSearchParams(next, { replace: true });
		resetProjectsFilters();
	}

	function toggleSort(key: SortKey) {
		if (key === sortKey) {
			const nextDir = sortDir === 'asc' ? 'desc' : 'asc';
			const next = new URLSearchParams(searchParams);
			next.set('sort', key);
			if (nextDir === DEFAULT_SORT_DIR) next.delete('dir');
			else next.set('dir', nextDir);
			setSearchParams(next, { replace: true });
			return;
		}
		const next = new URLSearchParams(searchParams);
		if (key === DEFAULT_SORT) next.delete('sort');
		else next.set('sort', key);
		next.delete('dir');
		setSearchParams(next, { replace: true });
	}

	const rootOptions = ((): { label: string; path: string }[] => {
		const roots = new Set<string>();
		for (const project of allProjects) {
			roots.add(project.root);
		}
		for (const root of skippedRoots) {
			roots.add(root.path);
		}
		const duplicateLabels = new Set<string>();
		const seenLabels = new Set<string>();
		for (const root of roots) {
			const label = compactRootLabel(root);
			if (seenLabels.has(label)) duplicateLabels.add(label);
			seenLabels.add(label);
		}
		return [...roots]
			.map((path) => {
				const baseLabel = compactRootLabel(path);
				return {
					label: duplicateLabels.has(baseLabel) ? compactRootLabel(path, 2) : baseLabel,
					path,
				};
			})
			.sort((left, right) => left.label.localeCompare(right.label));
	})();

	const rootFilter =
		rootFilterRaw !== 'all' && rootOptions.some((option) => option.path === rootFilterRaw)
			? rootFilterRaw
			: 'all';

	const milestoneOptions = ((): string[] => {
		const set = new Set<string>();
		for (const project of allProjects) {
			const ms = project.metadata.roadmap?.currentMilestone;
			if (ms) set.add(ms);
		}
		return [...set].sort((a, b) => a.localeCompare(b));
	})();

	const lowerQuery = query.trim().toLowerCase();
	const filtered = allProjects.filter((project) => {
		if (lowerQuery) {
			const haystack = `${project.name} ${project.path}`.toLowerCase();
			if (!haystack.includes(lowerQuery)) return false;
		}
		if (rootFilter !== 'all' && project.root !== rootFilter) return false;
		if (milestoneFilter !== 'all') {
			if ((project.metadata.roadmap?.currentMilestone ?? '') !== milestoneFilter)
				return false;
		}
		if (syncFilter !== 'all' && project.metadata.sync.syncState !== syncFilter) return false;
		if (phaseFilter !== 'all' && project.phase !== phaseFilter) return false;
		if (maturityFilter !== 'all') {
			const maturity = project.metadata.maturity;
			if (maturityFilter === 'complete') {
				if (maturity.percent < 100) return false;
			} else if (maturityFilter === 'incomplete') {
				if (maturity.percent >= 100) return false;
			} else if (maturity.currentStageId !== maturityFilter) {
				return false;
			}
		}
		return true;
	});

	const sorted = [...filtered].sort((a, b) => compareProjects(a, b, sortKey, sortDir, gitStatus));

	const hasFilters =
		query.trim().length > 0 ||
		rootFilter !== 'all' ||
		milestoneFilter !== 'all' ||
		syncFilter !== 'all' ||
		phaseFilter !== 'all' ||
		maturityFilter !== 'all';

	return {
		hasFilters,
		maturityFilter,
		milestoneFilter,
		milestoneOptions,
		phaseFilter,
		query,
		resetFilters,
		rootFilter,
		rootOptions,
		sortDir,
		sorted,
		sortKey,
		syncFilter,
		toggleSort,
		updateParam,
	};
}
