import type { GitCommitRef } from './projects/metadata.ts';

// Hand-mirrored from the backend run-commits / commit-diff / project-file result shapes
// (backend/src/services/run/commits.ts, services/git/commitDiff.ts,
// services/project/fileContent.ts). All three endpoints answer HTTP 200 with a `state`
// discriminator instead of error statuses.

export type RunCommitsState = 'ledger-missing' | 'not-recorded' | 'ok' | 'run-not-found';
export type RunFileChangeSource = 'iteration-artifacts' | 'ledger' | 'unavailable';

export interface RunFileChanges {
	created: string[];
	edited: string[];
	source: RunFileChangeSource;
	truncated: boolean;
}

export interface RunCommitsResponse {
	commits: GitCommitRef[];
	commitsCreatedCount: number;
	fileChanges: RunFileChanges;
	filesCreated: number;
	filesEdited: number;
	reason: null | string;
	state: RunCommitsState;
}

export type CommitDiffState = 'error' | 'missing-commit' | 'not-a-repo' | 'ok' | 'project-missing';

export interface CommitDiffResponse {
	diff: string;
	reason: null | string;
	state: CommitDiffState;
	/** Bytes git produced before the response was capped or the command finished. */
	totalBytes: number;
	/** True when `diff` carries only the leading window of a patch larger than the server cap. */
	truncated: boolean;
}

export type ProjectFileKind = 'json' | 'markdown' | 'text';

export type ProjectFileState = 'invalid-path' | 'missing' | 'ok';

export interface ProjectFileResponse {
	content: string;
	kind: ProjectFileKind;
	/** Normalized project-root-relative POSIX path of the file that was read. */
	path: string;
	reason: null | string;
	state: ProjectFileState;
	totalBytes: number;
	/** True when `content` carries only the leading window of a file larger than the server cap. */
	truncated: boolean;
}
