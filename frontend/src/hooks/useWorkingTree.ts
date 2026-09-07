import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { WorkingTreeActionResponse } from '../api/types.ts';

import {
	commitProjectPaths,
	commitProjectStaged,
	discardProjectPaths,
	getProjectWorkingTree,
	resetProjectIndex,
	stageProjectPaths,
	unstageProjectPaths,
} from '../api/projects.ts';
import { retryUnlessClientError } from '../api/retry.ts';
import { invalidateProjectQueries } from './useProjectsShared.ts';

export type WorkingTreeCommand =
	| { kind: 'commit-staged'; message: string }
	| { kind: 'commit'; message: string; paths: string[] }
	| { kind: 'discard'; paths: string[] }
	| { kind: 'reset' }
	| { kind: 'stage'; paths: string[] }
	| { kind: 'unstage'; paths: string[] };

export function workingTreeQueryKey(id: string | undefined) {
	return ['project-working-tree', id];
}

// The per-file listing is a git shell-out, so it is cached apart from the aggregate git-status
// badge. A short stale window rather than `Infinity`: the working tree also changes from outside
// the panel (an editor, a terminal pane, a Run), so revisiting the tab should re-read it.
export function useProjectWorkingTree(id: string | undefined) {
	return useQuery({
		enabled: Boolean(id),
		queryFn: ({ signal }) => getProjectWorkingTree(id ?? '', signal),
		queryKey: workingTreeQueryKey(id),
		retry: retryUnlessClientError,
		staleTime: 5_000,
	});
}

async function runCommand(id: string, command: WorkingTreeCommand) {
	switch (command.kind) {
		case 'commit':
			return await commitProjectPaths(id, command.paths, command.message);
		case 'commit-staged':
			return await commitProjectStaged(id, command.message);
		case 'discard':
			return await discardProjectPaths(id, command.paths);
		case 'reset':
			return await resetProjectIndex(id);
		case 'stage':
			return await stageProjectPaths(id, command.paths);
		case 'unstage':
			return await unstageProjectPaths(id, command.paths);
	}
}

/**
 * One mutation for every working-tree action. They are mutually exclusive in the UI — the toolbar
 * disables while any of them is in flight — so a single `isPending` is what the caller actually
 * wants, and a shared success path keeps the cache reconciliation in one place.
 */
export function useWorkingTreeCommand(id: string | undefined) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (command: WorkingTreeCommand) => runCommand(id ?? '', command),
		onSuccess: (result: WorkingTreeActionResponse) => {
			// Every action answers with the refreshed listing, so seed it rather than re-fetching.
			queryClient.setQueryData(workingTreeQueryKey(id), result.after);
			// These live under their own top-level keys, which the shared project helper (matching
			// on `['project']`) does not reach.
			void queryClient.invalidateQueries({ queryKey: ['project-git-status'] });
			void queryClient.invalidateQueries({ queryKey: ['projects', 'git-status'] });
			void queryClient.invalidateQueries({ queryKey: ['project-repository-info'] });
			void queryClient.invalidateQueries({ queryKey: ['project-repository-refs'] });
			invalidateProjectQueries(queryClient);
		},
	});
}
