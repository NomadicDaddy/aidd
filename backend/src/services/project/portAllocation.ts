import { defaultIgnoredFolders, type ResolvedWebConfig } from 'aidd-shared/config';
import { resolve } from 'node:path';

import { HttpError } from '../errors.ts';
import { gatherPorts } from '../projectMetadata.ts';
import { createIgnoredDirectoryMatcher, scanRoot } from './discovery.ts';

export interface AllocatedPorts {
	backendPort: number;
	frontendPort: number;
}

// Collect every 33x0/33x1 port already assigned across the managed projects. Reuses the same
// discovery primitives as portStatusService (scanRoot + gatherPorts) so the used-port view stays
// consistent with the /ports probe.
async function collectUsedPorts(config: ResolvedWebConfig): Promise<Set<number>> {
	const isIgnoredDirectory = createIgnoredDirectoryMatcher(
		config.ignoredFolders.length > 0 ? config.ignoredFolders : defaultIgnoredFolders
	);
	const scans = await Promise.all(
		config.allowedRoots.map((root) => scanRoot(root, 2, isIgnoredDirectory))
	);
	const paths = new Set<string>();
	for (const scan of scans) {
		for (const project of scan.projects) {
			paths.add(resolve(project.path));
		}
	}
	const used = new Set<number>();
	await Promise.all(
		[...paths].map(async (path) => {
			const ports = await gatherPorts(path);
			if (ports?.frontendPort !== null && ports?.frontendPort !== undefined) {
				used.add(ports.frontendPort);
			}
			if (ports?.backendPort !== null && ports?.backendPort !== undefined) {
				used.add(ports.backendPort);
			}
		})
	);
	return used;
}

// Allocate the next free frontend/backend pair on the 33x0/33x1 convention (from 3340; 3330/3331 are
// reserved for the template's own dev server). aidd owns allocation; init.ts writes the chosen pair
// into spernakit.psd1 so the fleet manifest stays in sync.
export async function allocateSpernakitPorts(config: ResolvedWebConfig): Promise<AllocatedPorts> {
	const used = await collectUsedPorts(config);
	for (let frontendPort = 3340; frontendPort < 9000; frontendPort += 10) {
		if (!used.has(frontendPort) && !used.has(frontendPort + 1)) {
			return { backendPort: frontendPort + 1, frontendPort };
		}
	}
	throw new HttpError('No free 33x0/33x1 port pair available for the new Spernakit app', 500);
}
