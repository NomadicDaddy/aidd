import { defaultIgnoredFolders, type ResolvedWebConfig } from 'aidd-shared/config';
import { resolve } from 'node:path';

import { encodeProjectId } from '../../paths.ts';
import { isPortListening } from '../portProbe.ts';
import { gatherPorts } from '../projectMetadata.ts';
import { chooseProjectRoot, createIgnoredDirectoryMatcher, scanRoot } from './discovery.ts';

export interface PortStatusEntry {
	backend: boolean | null;
	frontend: boolean | null;
}

export type PortStatusMap = Record<string, PortStatusEntry>;

const CONCURRENCY = 8;

interface ProjectPortInput {
	backendPort: null | number;
	frontendPort: null | number;
	id: string;
}

async function probeOne(input: ProjectPortInput): Promise<[string, PortStatusEntry]> {
	const [backend, frontend] = await Promise.all([
		input.backendPort !== null ? isPortListening(input.backendPort) : Promise.resolve(null),
		input.frontendPort !== null ? isPortListening(input.frontendPort) : Promise.resolve(null),
	]);
	return [input.id, { backend, frontend }];
}

async function discoverProjectPorts(config: ResolvedWebConfig): Promise<ProjectPortInput[]> {
	const isIgnoredDirectory = createIgnoredDirectoryMatcher(
		config.ignoredFolders.length > 0 ? config.ignoredFolders : defaultIgnoredFolders,
	);
	const scans = await Promise.all(
		config.allowedRoots.map((root) => scanRoot(root, 2, isIgnoredDirectory)),
	);
	const discovered = new Map<string, { path: string; root: string }>();
	for (const scan of scans) {
		for (const project of scan.projects) {
			const canonicalPath = resolve(project.path);
			discovered.set(canonicalPath, {
				...chooseProjectRoot(discovered.get(canonicalPath), project),
				path: canonicalPath,
			});
		}
	}
	const projects = [...discovered.values()];
	const inputs = await Promise.all(
		projects.map(async ({ path }): Promise<null | ProjectPortInput> => {
			const ports = await gatherPorts(path);
			if (!ports || (ports.backendPort === null && ports.frontendPort === null)) {
				return { backendPort: null, frontendPort: null, id: encodeProjectId(path) };
			}
			return {
				backendPort: ports.backendPort,
				frontendPort: ports.frontendPort,
				id: encodeProjectId(path),
			};
		}),
	);
	return inputs.filter((input): input is ProjectPortInput => input !== null);
}

export async function getPortStatusMap(config: ResolvedWebConfig): Promise<PortStatusMap> {
	const inputs = await discoverProjectPorts(config);
	const results: [string, PortStatusEntry][] = [];
	for (let i = 0; i < inputs.length; i += CONCURRENCY) {
		const batch = inputs.slice(i, i + CONCURRENCY);
		const settled = await Promise.allSettled(batch.map(probeOne));
		for (const r of settled) {
			if (r.status === 'fulfilled') results.push(r.value);
		}
	}
	return Object.fromEntries(results);
}
