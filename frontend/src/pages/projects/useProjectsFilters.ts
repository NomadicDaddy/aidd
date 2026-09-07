import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router';

import type {
	ProjectDiscoverySkippedRoot,
	ProjectGitStatusMapEntry,
	ProjectPhase,
	ProjectSummary,
	ProjectSyncState,
} from '../../api/types.ts';

import { filterRegister } from '../../lib/filterFields.ts';
import { usePrefsStore } from '../../stores/prefsStore.ts';
import {
	MATURITY_FILTERS,
	type MaturityFilter,
	maturityFilterLabels,
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
import { normalizeFilterParams, PROJECT_FILTER_KEYS } from './projectsFilterParams.ts';

function compactRootLabel(path: string, segmentCount = 1): string {
	const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '');
	const parts = normalized.split('/').filter(Boolean);
	return parts.slice(-segmentCount).join('/') || path;
}

export function useProjectsPageFilters(
	allProjects: ProjectSummary[],
	skippedRoots: ProjectDiscoverySkippedRoot[],
	rootOptionsKnown: boolean,
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
		const hasUrlFilters = PROJECT_FILTER_KEYS.some((key) => searchParams.has(key));
		if (hasUrlFilters) return;
		const next = new URLSearchParams();
		for (const key of PROJECT_FILTER_KEYS) {
			const value = projectsFilters[key];
			if (value) next.set(key, value);
		}
		if (Array.from(next.keys()).length > 0) {
			setSearchParams(next, { replace: true });
		}
	}, [projectsFilters, searchParams, setSearchParams]);

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

	// The search box calls this once per keystroke. Building the next params from the
	// `searchParams` of the render that created this closure means keystrokes batched into
	// one render all start from the same copy and only the last one survives, so read the
	// live params through the updater instead.
	function updateParam(key: string, value: null | string) {
		setSearchParams(
			(previous) => {
				const next = new URLSearchParams(previous);
				if (value === null || value === '' || value === 'all') {
					next.delete(key);
				} else {
					next.set(key, value);
				}
				return next;
			},
			{ replace: true },
		);
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
			setSearchParams(
				(previous) => {
					const next = new URLSearchParams(previous);
					next.set('sort', key);
					if (nextDir === DEFAULT_SORT_DIR) next.delete('dir');
					else next.set('dir', nextDir);
					return next;
				},
				{ replace: true },
			);
			return;
		}
		setSearchParams(
			(previous) => {
				const next = new URLSearchParams(previous);
				if (key === DEFAULT_SORT) next.delete('sort');
				else next.set('sort', key);
				next.delete('dir');
				return next;
			},
			{ replace: true },
		);
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

	// Joined to a string rather than passed as a Set, so the effect below has a dependency that is
	// stable by value. A fresh Set each render would run it each render, and it writes to a store.
	// An empty key can mean either the project list has not loaded or a successful list contains no
	// roots. The query result distinguishes those states so an empty fleet can still reject a stale
	// root without stripping a valid root while its options are still loading.
	const rootPathKey = rootOptions.map((option) => option.path).join('\n');

	// The URL is the filter state and the store is its echo, so this keeps both to the values the
	// surface can actually act on. An unrecognized value used to survive in the address bar while
	// the read path below collapsed it to 'all': the page filtered nothing, hasFilters was false, so
	// the Reset control that would have cleared it reported there was nothing to clear — and the
	// hydration effect above replayed the stored copy onto the next bare /projects visit. Stripping
	// and storing in one pass is what stops the store from ever holding a value the URL is about to
	// lose, which is the state that made it outlive the tab.
	useEffect(() => {
		const rootPaths = rootOptionsKnown
			? new Set(rootPathKey === '' ? [] : rootPathKey.split('\n'))
			: null;
		const normalized = normalizeFilterParams(searchParams, rootPaths);
		if (normalized) setSearchParams(normalized, { replace: true });
		const stored = normalized ?? searchParams;
		setProjectsFilters({
			dir: stored.get('dir') ?? '',
			maturity: stored.get('maturity') ?? '',
			milestone: stored.get('milestone') ?? '',
			phase: stored.get('phase') ?? '',
			q: stored.get('q') ?? '',
			root: stored.get('root') ?? '',
			sort: stored.get('sort') ?? '',
			sync: stored.get('sync') ?? '',
		});
	}, [rootOptionsKnown, rootPathKey, searchParams, setProjectsFilters, setSearchParams]);

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

	// Read from the other end of the same six values `hasFilters` counts: one says whether anything
	// is in force, the other says what, and a seventh filter added above has to reach both.
	const emptyFilters = filterRegister(resetFilters, [
		query.trim() !== '' && { label: 'Search', value: query.trim() },
		syncFilter !== 'all' && { label: 'Sync', value: syncFilter },
		phaseFilter !== 'all' && { label: 'Phase', value: phaseFilter },
		maturityFilter !== 'all' && {
			label: 'Maturity',
			value: maturityFilterLabels[maturityFilter],
		},
		rootFilter !== 'all' && {
			label: 'Root',
			value: rootOptions.find((root) => root.path === rootFilter)?.label ?? rootFilter,
		},
		milestoneFilter !== 'all' && { label: 'Milestone', value: milestoneFilter },
	]);

	return {
		emptyFilters,
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
