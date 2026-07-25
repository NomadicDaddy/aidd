import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { ViewportArg } from './crawltest-types.ts';

export function getVersionedScreenshotDir(baseDir: string, rootDir: string): string {
	try {
		const manifest = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8')) as {
			version?: unknown;
		};
		if (typeof manifest.version !== 'string' || manifest.version.trim().length === 0) {
			return baseDir;
		}
		return join(baseDir, `v${manifest.version}`);
	} catch {
		return baseDir;
	}
}

export function screenshotFilename(route: string, viewport: ViewportArg): string {
	const routeName = route.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');
	const baseName = routeName.length > 0 ? routeName.toLowerCase() : 'root';
	return viewport === 'desktop' ? `${baseName}.png` : `${viewport}-${baseName}.png`;
}
