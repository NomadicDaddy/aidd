import { cp, mkdir, readFile, stat } from 'node:fs/promises';
import { dirname, isAbsolute, join, normalize } from 'node:path';

import { PUBLIC_DOCUMENT_FILE_ASSETS, PUBLIC_DOCUMENT_ROOT_ASSETS } from '../release/common.ts';
import { CORE_CATALOG_DIRS, REQUIRED_FILE_ASSETS } from '../standalone/constants.ts';
import { parseDistributedMaterialsRegistry } from './registry-schema.ts';
import { type TrackedSurfaces } from './registry-types.ts';
import { DISTRIBUTED_MATERIALS_REGISTRY } from './registry-types.ts';
import { allClassifiedPaths } from './registry-validation.ts';

export interface PackagedTrackedSurfaces {
	catalogRoots: string[];
	publicDocumentPaths: string[];
	publicDocumentRoots: string[];
}

function uniqueSorted(paths: readonly string[]): string[] {
	return [...new Set(paths)].sort();
}

export function expectedPackagedTrackedSurfaces(): PackagedTrackedSurfaces {
	return {
		catalogRoots: uniqueSorted(CORE_CATALOG_DIRS),
		publicDocumentPaths: uniqueSorted([
			...REQUIRED_FILE_ASSETS,
			...PUBLIC_DOCUMENT_FILE_ASSETS,
		]),
		publicDocumentRoots: uniqueSorted(PUBLIC_DOCUMENT_ROOT_ASSETS),
	};
}

function safeRelativePath(configuredPath: string): string {
	const normalizedPath = configuredPath.replaceAll('\\', '/');
	if (
		normalizedPath.length === 0 ||
		normalizedPath === '.' ||
		normalizedPath.startsWith('../') ||
		normalizedPath.includes('/../') ||
		isAbsolute(configuredPath) ||
		normalize(configuredPath).replaceAll('\\', '/') !== normalizedPath
	) {
		throw new Error(`Distributed surface path is not repository-relative: ${configuredPath}`);
	}
	return normalizedPath;
}

const EXACT_PATH_FORBIDDEN = /[*?[\]{}]/;

function safeRegisteredPath(configuredPath: string): string {
	const safePath = safeRelativePath(configuredPath);
	if (
		configuredPath !== safePath ||
		safePath.endsWith('/') ||
		EXACT_PATH_FORBIDDEN.test(safePath)
	) {
		throw new Error(`Distributed registry path is not exact: ${configuredPath}`);
	}
	return safePath;
}

function belongsToTargets(path: string, targets: readonly string[]): boolean {
	return targets.some((target) => path === target || path.startsWith(`${target}/`));
}

export async function listTrackedFiles(
	root: string,
	targets: readonly string[],
): Promise<string[]> {
	const safeTargets = targets.map(safeRelativePath);
	const proc = Bun.spawn(['git', '-C', root, 'ls-files', '--', ...safeTargets], {
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	const [code, stderr, stdout] = await Promise.all([
		proc.exited,
		new Response(proc.stderr).text(),
		new Response(proc.stdout).text(),
	]);
	if (code !== 0) {
		throw new Error(`Cannot enumerate distributed tracked files: ${stderr.trim()}`);
	}
	const trackedPaths = uniqueSorted(
		stdout
			.split(/\r?\n/)
			.map((path) => path.trim().replaceAll('\\', '/'))
			.filter(Boolean),
	);
	const existingPaths = await Promise.all(
		trackedPaths.map(async (path) => {
			const info = await stat(join(root, path)).catch(() => null);
			return info?.isFile() === true ? path : null;
		}),
	);
	return existingPaths.filter((path): path is string => path !== null);
}

export async function listRegisteredDistributionFiles(
	root: string,
	targets: readonly string[],
): Promise<string[]> {
	const registryPath = join(root, DISTRIBUTED_MATERIALS_REGISTRY);
	const registryValue: unknown = JSON.parse(await readFile(registryPath, 'utf8'));
	const registry = parseDistributedMaterialsRegistry(registryValue);
	const safeTargets = targets.map(safeRelativePath);
	const selectedPaths = uniqueSorted(
		allClassifiedPaths(registry)
			.map(safeRegisteredPath)
			.filter((path) => belongsToTargets(path, safeTargets)),
	);

	for (const path of selectedPaths) {
		const info = await stat(join(root, path)).catch(() => null);
		if (info?.isFile() !== true) {
			throw new Error(`Registered distribution file is missing or not a file: ${path}`);
		}
	}
	return selectedPaths;
}

function belongsToSurfaces(path: string, surfaces: TrackedSurfaces): boolean {
	if (surfaces.publicDocumentPaths.includes(path)) return true;
	return [
		...surfaces.catalogRoots,
		...surfaces.publicDocumentRoots,
		...surfaces.publicStaticAssetRoots,
	].some((root) => path.startsWith(`${root}/`));
}

export async function discoverDistributedPaths(
	root: string,
	surfaces: TrackedSurfaces,
	registeredPaths: readonly string[],
): Promise<string[]> {
	const targets = [
		...surfaces.catalogRoots,
		...surfaces.publicDocumentPaths,
		...surfaces.publicDocumentRoots,
		...surfaces.publicStaticAssetRoots,
	].map(safeRelativePath);
	const paths = new Set(await listTrackedFiles(root, targets));
	for (const registeredPath of registeredPaths) {
		const safePath = safeRelativePath(registeredPath);
		if (belongsToSurfaces(safePath, surfaces)) paths.add(safePath);
	}
	return uniqueSorted([...paths]);
}

export async function copyTrackedFiles(
	root: string,
	destinationRoot: string,
	targets: readonly string[],
): Promise<void> {
	for (const relativePath of await listTrackedFiles(root, targets)) {
		const destination = join(destinationRoot, relativePath);
		await mkdir(dirname(destination), { recursive: true });
		await cp(join(root, relativePath), destination, { force: true });
	}
}

export async function copyRegisteredDistributionFiles(
	root: string,
	destinationRoot: string,
	targets: readonly string[],
): Promise<void> {
	for (const relativePath of await listRegisteredDistributionFiles(root, targets)) {
		const destination = join(destinationRoot, relativePath);
		await mkdir(dirname(destination), { recursive: true });
		await cp(join(root, relativePath), destination, { force: true });
	}
}
