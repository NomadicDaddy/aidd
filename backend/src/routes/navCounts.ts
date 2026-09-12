import type { NavCounts } from 'aidd-shared/contracts/nav-counts';

import { discoverAuditNames } from 'aidd-shared/modes/audit-shared';
import { Elysia } from 'elysia';

import type { WebContext } from '../context.ts';

/**
 * One request for every sidebar count, rather than one per badge.
 *
 * The shell mounts on every page, and the catalog endpoints these numbers come from are not shaped
 * for a badge: `GET /api/v1/audits` alone scans every project, builds the applicability matrix,
 * collects outcomes from the database per project path and scores the whole catalog against the
 * filesystem, all of it discarded to render one number. Each count here is the same enumeration its
 * page lists, without the enrichment the page then draws.
 *
 * `auditService` and `scheduledTaskService` are optional on the context. An absent service counts
 * zero, which renders no badge — matching the destination, whose page cannot load either.
 */
export function createNavCountsRoutes(context: WebContext) {
	return new Elysia({ prefix: '/api/v1/nav-counts' }).get('/', async (): Promise<NavCounts> => {
		const [audits, recipes, scheduled, skills] = await Promise.all([
			context.auditService ? discoverAuditNames(context.rootDir) : [],
			context.recipeService.listRecipes(),
			// The Scheduled page opens on its 'active' filter; paused, completed and archived
			// tasks are history and are not what the row points at.
			context.scheduledTaskService?.list(['active']) ?? [],
			context.skillService.listSkills(),
		]);
		return {
			audits: audits.length,
			recipes: recipes.length,
			scheduled: scheduled.length,
			skills: skills.length,
		};
	});
}
