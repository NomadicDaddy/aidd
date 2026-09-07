import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The repository root, walked up from a module's own URL.
 *
 * aidd ships as source, so there is exactly one shape to resolve: a checkout run by Bun.
 */
export function resolveRootDir(importMetaUrl: string, sourceDepth: number): string {
	const fileDir = dirname(fileURLToPath(importMetaUrl));
	const segments = Array.from({ length: sourceDepth }, () => '..');
	return resolve(fileDir, ...segments);
}
