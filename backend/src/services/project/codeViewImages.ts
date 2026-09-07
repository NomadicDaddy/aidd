import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';

import type { ProjectCodeFileResult } from './codeViewTypes.ts';

import { recordDataMovement } from '../dataMovementTrace.ts';
import { languageForPath } from '../git/repoLanguages.ts';

const maxImageFileBytes = 12 * 1024 * 1024;

function imageMediaTypeForPath(path: string): null | string {
	switch (extname(path).toLowerCase()) {
		case '.avif':
			return 'image/avif';
		case '.bmp':
			return 'image/bmp';
		case '.gif':
			return 'image/gif';
		case '.ico':
			return 'image/x-icon';
		case '.jpeg':
		case '.jpg':
			return 'image/jpeg';
		case '.png':
			return 'image/png';
		case '.webp':
			return 'image/webp';
		default:
			return null;
	}
}

export async function readProjectCodeImageFile({
	normalizedPath,
	resolvedPath,
	totalBytes,
}: {
	normalizedPath: string;
	resolvedPath: string;
	totalBytes: number;
}): Promise<null | ProjectCodeFileResult> {
	const imageMediaType = imageMediaTypeForPath(normalizedPath);
	if (imageMediaType === null) return null;
	if (totalBytes > maxImageFileBytes) {
		return {
			content: '',
			language: languageForPath(normalizedPath),
			path: normalizedPath,
			reason: 'Image file is too large to render in the code viewer.',
			sizeBytes: totalBytes,
			state: 'binary',
			totalBytes,
			truncated: false,
		};
	}
	const imageBuffer = await readFile(resolvedPath);
	recordDataMovement({
		category: 'file',
		operation: 'project.code.image',
		status: 'hit',
		summary: { bytes: imageBuffer.length, mediaType: imageMediaType, path: normalizedPath },
		target: resolvedPath,
	});
	return {
		content: `data:${imageMediaType};base64,${imageBuffer.toString('base64')}`,
		language: languageForPath(normalizedPath),
		path: normalizedPath,
		reason: null,
		sizeBytes: totalBytes,
		state: 'image',
		totalBytes,
		truncated: false,
	};
}
