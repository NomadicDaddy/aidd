import { Elysia } from 'elysia';

import type { WebContext } from '../context.ts';

import { readWorkingTree } from '../services/git/workingTree.ts';
import {
	discardWorkingTreePaths,
	resetWorkingTreeIndex,
	stageWorkingTreePaths,
	unstageWorkingTreePaths,
} from '../services/git/workingTreeActions.ts';
import {
	commitStagedWorkingTree,
	commitWorkingTreePaths,
} from '../services/git/workingTreeCommit.ts';
import {
	projectIdParams,
	workingTreeCommitBody,
	workingTreeCommitStagedBody,
	workingTreePathsBody,
} from './projects.schemas.ts';

// Per-file working-tree surface behind the Repository tab's dirty-file manager.
//
// GET mirrors the other repository reads: HTTP 200 with a `state` discriminator rather than an
// error status, so "not a git repository" renders as an empty state instead of a failed request.
// The mutations are the opposite — a rejected selection or a failed git command is a real error the
// user has to see, so they surface as 4xx via HttpError, and every one of them answers with the
// refreshed listing so the client never has to re-fetch to redraw.
export function createProjectWorkingTreeRoutes(context: WebContext) {
	const projectDir = async (id: string) =>
		await context.projectService.resolveDiscoveredProject(id);

	return new Elysia({ prefix: '/api/v1/projects' })
		.get(
			'/:id/working-tree',
			async ({ params }) => await readWorkingTree(await projectDir(params.id)),
			{ params: projectIdParams },
		)
		.post(
			'/:id/working-tree/stage',
			async ({ body, params }) =>
				await stageWorkingTreePaths(await projectDir(params.id), body.paths),
			{ body: workingTreePathsBody, params: projectIdParams },
		)
		.post(
			'/:id/working-tree/unstage',
			async ({ body, params }) =>
				await unstageWorkingTreePaths(await projectDir(params.id), body.paths),
			{ body: workingTreePathsBody, params: projectIdParams },
		)
		.post(
			'/:id/working-tree/discard',
			async ({ body, params }) =>
				await discardWorkingTreePaths(await projectDir(params.id), body.paths),
			{ body: workingTreePathsBody, params: projectIdParams },
		)
		.post(
			'/:id/working-tree/reset',
			async ({ params }) => await resetWorkingTreeIndex(await projectDir(params.id)),
			{ params: projectIdParams },
		)
		.post(
			'/:id/working-tree/commit',
			async ({ body, params }) =>
				await commitWorkingTreePaths(await projectDir(params.id), body.paths, body.message),
			{ body: workingTreeCommitBody, params: projectIdParams },
		)
		.post(
			'/:id/working-tree/commit-staged',
			async ({ body, params }) =>
				await commitStagedWorkingTree(await projectDir(params.id), body.message),
			{ body: workingTreeCommitStagedBody, params: projectIdParams },
		);
}
