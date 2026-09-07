import { readFileSync } from 'node:fs';
import path from 'node:path';

const UPLOAD_DIR = path.resolve('uploads');

export function readUpload(name: string): string {
	return readFileSync(path.join(UPLOAD_DIR, name), 'utf8');
}

export function publicAssetUrl(name: string): string {
	return `/assets/${encodeURIComponent(name)}`;
}
