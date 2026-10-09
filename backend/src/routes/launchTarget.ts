import { Elysia } from 'elysia';

import type { WebContext } from '../context.ts';

import { createLaunchDefaultsRoutes } from './launchDefaults.ts';
import { createProviderRestRoutes } from './providerRest.ts';

/**
 * Everything that decides which backend a launch runs on: the resolved defaults and provider rest.
 * Grouped so server.ts mounts them with one `.use()`: its chain is long enough that one more link
 * pushes Elysia's accumulated route type past TypeScript's instantiation depth (TS2589).
 */
export function createLaunchTargetRoutes(context: WebContext) {
	return new Elysia()
		.use(createLaunchDefaultsRoutes(context))
		.use(createProviderRestRoutes(context));
}
