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

export interface ProjectCodeTreeResult {
	files: ProjectCodeFileEntry[];
	reason: null | string;
	state: ProjectCodeTreeState;
	totalFiles: number;
	truncated: boolean;
}

export interface ProjectCodeFileResult {
	content: string;
	language: null | string;
	path: string;
	reason: null | string;
	sizeBytes: number;
	state: ProjectCodeFileState;
	totalBytes: number;
	truncated: boolean;
}
