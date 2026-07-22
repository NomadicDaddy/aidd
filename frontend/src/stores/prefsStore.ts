import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { summarizeValue, traceDataMovement } from '../lib/dataMovementTrace.ts';

export interface ProjectsFiltersState {
	dir: string;
	maturity: string;
	milestone: string;
	phase: string;
	q: string;
	root: string;
	sort: string;
	sync: string;
}

const emptyProjectsFilters: ProjectsFiltersState = {
	dir: '',
	maturity: '',
	milestone: '',
	phase: '',
	q: '',
	root: '',
	sort: '',
	sync: '',
};

interface PrefsState {
	projectsFilters: ProjectsFiltersState;
	projectView: 'cards' | 'table';
	recipesView: 'cards' | 'table';
	resetProjectsFilters: () => void;
	setProjectsFilters: (filters: ProjectsFiltersState) => void;
	setProjectView: (projectView: PrefsState['projectView']) => void;
	setRecipesView: (recipesView: PrefsState['recipesView']) => void;
}

export const usePrefsStore = create<PrefsState>()(
	persist(
		(set, get) => ({
			projectsFilters: emptyProjectsFilters,
			projectView: 'cards',
			recipesView: 'cards',
			resetProjectsFilters: () => {
				const before = get().projectsFilters;
				set({ projectsFilters: emptyProjectsFilters });
				traceDataMovement({
					category: 'state',
					layer: 'state',
					operation: 'resetProjectsFilters',
					source: 'prefsStore',
					summary: {
						after: summarizeValue(emptyProjectsFilters),
						before: summarizeValue(before),
						changedKeys: ['projectsFilters'],
					},
				});
			},
			setProjectsFilters: (projectsFilters) => {
				const before = get().projectsFilters;
				const changedKeys = (Object.keys(projectsFilters) as (keyof ProjectsFiltersState)[])
					.filter((key) => before[key] !== projectsFilters[key])
					.map((key) => key as string);
				if (changedKeys.length === 0) return;
				set({ projectsFilters });
				traceDataMovement({
					category: 'state',
					layer: 'state',
					operation: 'setProjectsFilters',
					source: 'prefsStore',
					summary: {
						after: summarizeValue(projectsFilters),
						before: summarizeValue(before),
						changedKeys,
					},
				});
			},
			setProjectView: (projectView) => {
				const before = get().projectView;
				set({ projectView });
				traceDataMovement({
					category: 'state',
					layer: 'state',
					operation: 'setProjectView',
					source: 'prefsStore',
					summary: {
						after: summarizeValue(projectView),
						before: summarizeValue(before),
						changedKeys: ['projectView'],
					},
				});
			},
			setRecipesView: (recipesView) => {
				const before = get().recipesView;
				set({ recipesView });
				traceDataMovement({
					category: 'state',
					layer: 'state',
					operation: 'setRecipesView',
					source: 'prefsStore',
					summary: {
						after: summarizeValue(recipesView),
						before: summarizeValue(before),
						changedKeys: ['recipesView'],
					},
				});
			},
		}),
		{ name: 'aidd-prefs' }
	)
);
