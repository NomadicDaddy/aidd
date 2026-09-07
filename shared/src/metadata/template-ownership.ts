import { stat } from 'node:fs/promises';
import { basename, join } from 'node:path';

import type { Feature } from './features/types.ts';

/**
 * Detect the Spernakit template repository itself.
 *
 * Inside the template, feature records ARE the source of truth and the roadmap is free to rewrite
 * their dependencies. In a derived app the same records are copies that a template sync overwrites,
 * so rewriting them here just churns them until the next sync reverts the change.
 */
export async function isTemplateRepo(projectDir: string): Promise<boolean> {
	if (basename(projectDir) !== 'spernakit') return false;
	return await stat(join(projectDir, 'scripts', 'init.ts')).then(
		() => true,
		() => false,
	);
}

/**
 * Whether a feature record is owned by the template rather than by the project.
 *
 * The template stamps `spernakit_version` into every record it seeds, and those records arrive in a
 * derived app already complete: they describe the shell the app was scaffolded from, not work the
 * app's blueprint asked for. Inside the template repository the same records are the product, so
 * ownership only applies outside it — which is why the caller has to say which one it is looking at
 * (see {@link isTemplateRepo}).
 */
export function isTemplateOwnedFeature(feature: Feature, templateRepo: boolean): boolean {
	return !templateRepo && typeof feature['spernakit_version'] === 'string';
}
