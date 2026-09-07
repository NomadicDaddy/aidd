import { readFile, writeFile } from 'node:fs/promises';

import { recordDataMovement } from './dataMovementTrace.ts';

// Format files in place using the TARGET project's own prettier config. The runtime metadata
// serializers (feature.json via JSON.stringify 2-space, roadmap.json via serializeRoadmap) do not
// match the repo's `.prettierrc` (useTabs, tabWidth 4, jsonRecursiveSort + plugins), so a feature
// written by the report flow shows up dirty against `prettier --check` until this pass runs.
//
// Best-effort: a single file that fails to read/resolve/format is traced and skipped rather than
// aborting the caller. `resolveConfig(path)` walks up from the file to find the project's config
// (and resolves its plugins relative to it); when none exists prettier normalizes with defaults,
// which is harmless for the report flow.
export async function formatFiles(paths: string[]): Promise<void> {
	if (paths.length === 0) return;
	const { format, resolveConfig } = await import('prettier');
	for (const path of paths) {
		try {
			const config = (await resolveConfig(path)) ?? {};
			const source = await readFile(path, 'utf8');
			const formatted = await format(source, { ...config, filepath: path });
			if (formatted !== source) await writeFile(path, formatted);
		} catch (err) {
			recordDataMovement({
				category: 'file',
				operation: 'report.format',
				status: 'error',
				summary: { message: err instanceof Error ? err.message : String(err) },
				target: path,
			});
		}
	}
}
