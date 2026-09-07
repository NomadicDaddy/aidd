import { Elysia } from 'elysia';

import type { WebContext } from '../context.ts';

import { readProjectNotes, writeProjectNotes } from '../services/project/notes.ts';
import { projectIdParams, projectNotesBody } from './projects.schemas.ts';

// Read/write surface for a project's free-form markdown scratch pad at `.aidd/notes.md`. GET
// returns an empty pad when the file has never been written; PUT persists the editor's content
// and returns the freshly read state so the client can reconcile its saved timestamp.
export function createProjectNotesRoutes(context: WebContext) {
	return new Elysia({ prefix: '/api/v1/projects' })
		.get(
			'/:id/notes',
			async ({ params }) => {
				const projectDir = await context.projectService.resolveDiscoveredProject(params.id);
				return await readProjectNotes(projectDir);
			},
			{ params: projectIdParams },
		)
		.put(
			'/:id/notes',
			async ({ body, params }) => {
				const projectDir = await context.projectService.resolveDiscoveredProject(params.id);
				return await writeProjectNotes(projectDir, body.content);
			},
			{ body: projectNotesBody, params: projectIdParams },
		);
}
