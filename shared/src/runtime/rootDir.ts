import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function isCompiledBinary(): boolean {
	const exec = process.execPath.toLowerCase();
	return !exec.endsWith('bun') && !exec.endsWith('bun.exe');
}

export function resolveRootDir(importMetaUrl: string, sourceDepth: number): string {
	if (isCompiledBinary()) {
		return dirname(process.execPath);
	}
	const fileDir = dirname(fileURLToPath(importMetaUrl));
	const segments = Array.from({ length: sourceDepth }, () => '..');
	return resolve(fileDir, ...segments);
}
