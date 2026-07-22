import { Elysia, t } from 'elysia';

import type { WebContext } from '../context.ts';

// Dev Diary read surface: per-project and global narrative entries plus a unioned activity
// timeline. Both endpoints reconcile the on-disk `.aidd/diary/` files into the index before
// querying (throttled inside DiaryService), so a freshly written or hand-edited entry shows up
// without an explicit write hook. Generation is launched through the existing skill run
// endpoint (POST /api/v1/skills/diary-entry/run), so there is no POST here.
export function createDiaryRoutes(context: WebContext) {
	const listQuery = t.Object({
		cursor: t.Optional(t.String()),
		limit: t.Optional(t.Numeric({ maximum: 200, minimum: 1 })),
		projectPath: t.Optional(t.String()),
	});
	return new Elysia({ prefix: '/api/v1/diary' })
		.get(
			'/entries',
			async ({ query }) => {
				const options = {
					...(query.cursor !== undefined ? { cursor: query.cursor } : {}),
					...(query.limit !== undefined ? { limit: query.limit } : {}),
					...(query.projectPath !== undefined ? { projectPath: query.projectPath } : {}),
				};
				const page = await context.diaryService.listEntriesPage(options);
				return { entries: page.items, nextCursor: page.nextCursor };
			},
			{ query: listQuery }
		)
		.get(
			'/timeline',
			async ({ query }) => {
				const options = {
					...(query.cursor !== undefined ? { cursor: query.cursor } : {}),
					...(query.limit !== undefined ? { limit: query.limit } : {}),
					...(query.projectPath !== undefined ? { projectPath: query.projectPath } : {}),
				};
				const page = await context.diaryService.listTimelinePage(options);
				return { items: page.items, nextCursor: page.nextCursor };
			},
			{ query: listQuery }
		);
}
