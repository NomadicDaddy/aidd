// Hand-mirrored from backend/src/services/project/codeView.ts. The endpoint answers HTTP 200
// with a `state` discriminator so the UI can render repository, path, and binary-file states.

export type ProjectCodeFileState =
	| 'binary'
	| 'error'
	| 'image'
	| 'invalid-path'
	| 'missing'
	| 'not-a-repo'
	| 'ok'
	| 'project-missing';
export type ProjectCodeTreeState = 'error' | 'not-a-repo' | 'ok' | 'project-missing';

export interface ProjectCodeFileEntry {
	language: null | string;
	name: string;
	path: string;
	sizeBytes: number;
}

export interface ProjectCodeTreeResponse {
	files: ProjectCodeFileEntry[];
	reason: null | string;
	state: ProjectCodeTreeState;
	totalFiles: number;
	truncated: boolean;
}

export interface ProjectCodeFileResponse {
	content: string;
	language: null | string;
	path: string;
	reason: null | string;
	sizeBytes: number;
	state: ProjectCodeFileState;
	totalBytes: number;
	truncated: boolean;
}

// Hand-mirrored from backend/src/services/project/notes.ts. The free-form markdown scratch pad
// stored at `.aidd/notes.md`; `updatedAt` is the file mtime in ms, or null when never written.
export interface ProjectNotesResponse {
	content: string;
	updatedAt: null | number;
}
