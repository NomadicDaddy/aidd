import { readdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

export async function walkCacheFiles(
	projectRoot: string,
	directory: string,
	includeDot: boolean,
	isIgnored: (path: string) => boolean,
): Promise<string[]> {
	const files: string[] = [];
	async function visit(relativeDirectory: string): Promise<void> {
		for (const entry of await readdir(resolve(projectRoot, relativeDirectory), {
			withFileTypes: true,
		})) {
			if (!includeDot && entry.name.startsWith('.')) continue;
			const path = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
			// Prune before readdir/stat: disposable checkouts can vanish during cache evaluation.
			if (isIgnored(path)) continue;
			if (entry.isDirectory()) await visit(path);
			else if (entry.isFile()) files.push(path);
			else if (entry.isSymbolicLink() && (await stat(resolve(projectRoot, path))).isFile()) {
				// Keep file links, but never descend into linked directories or junctions.
				files.push(path);
			}
		}
	}
	await visit(directory);
	return files;
}
