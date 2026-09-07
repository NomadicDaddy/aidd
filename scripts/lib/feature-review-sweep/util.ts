import fs from 'node:fs';

import { type FeatureJson } from './types.ts';

export function ensureDir(dirPath: string): void {
	fs.mkdirSync(dirPath, { recursive: true });
}

export function hasOwn(json: FeatureJson, key: string): boolean {
	return Object.prototype.hasOwnProperty.call(json, key);
}

export function uniqueValues<T>(values: T[]): T[] {
	return [...new Set(values)];
}
