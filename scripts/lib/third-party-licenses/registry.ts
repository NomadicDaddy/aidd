import { join } from 'node:path';

import { discoverDistributedPaths, expectedPackagedTrackedSurfaces } from './distributed-paths.ts';
import { parseDistributedMaterialsRegistry } from './registry-schema.ts';
import {
	DISTRIBUTED_MATERIALS_REGISTRY,
	type DistributedMaterialsRegistry,
} from './registry-types.ts';
import {
	allClassifiedPaths,
	rootFileExists,
	validateDistributedMaterialsRegistry,
} from './registry-validation.ts';

export async function loadDistributedMaterialsRegistry(
	root: string,
): Promise<DistributedMaterialsRegistry> {
	const path = join(root, DISTRIBUTED_MATERIALS_REGISTRY);
	let value: unknown;
	try {
		value = await Bun.file(path).json();
	} catch (err) {
		const detail = err instanceof Error ? err.message : String(err);
		throw new Error(`Cannot read ${DISTRIBUTED_MATERIALS_REGISTRY}: ${detail}`, {
			cause: err,
		});
	}
	const registry = parseDistributedMaterialsRegistry(value);
	const issues = await validateDistributedMaterialsRegistry(registry, {
		distributedPaths: await discoverDistributedPaths(
			root,
			registry.trackedSurfaces,
			allClassifiedPaths(registry),
		),
		fileExists: rootFileExists(root),
		packagedSurfaces: expectedPackagedTrackedSurfaces(),
	});
	if (issues.length > 0) {
		throw new Error(
			`Invalid ${DISTRIBUTED_MATERIALS_REGISTRY}:\n${issues.map((issue) => `- ${issue}`).join('\n')}`,
		);
	}
	return registry;
}
