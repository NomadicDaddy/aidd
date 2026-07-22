import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { recordDataMovement } from '../dataMovementTrace.ts';
import { readTextOrNull, statOrNull } from '../fsHelpers.ts';

// A free-form, persistent markdown scratch pad per project, stored at `.aidd/notes.md`. Reads
// return an empty string when the file has never been written so the editor opens on a blank pad
// rather than an error; writes create the `.aidd/` directory on demand.
export const projectNotesMaxLength = 256 * 1024;

export interface ProjectNotesResult {
	content: string;
	updatedAt: null | number;
}

function notesFilePath(projectDir: string): string {
	return join(projectDir, '.aidd', 'notes.md');
}

export async function readProjectNotes(projectDir: string): Promise<ProjectNotesResult> {
	const path = notesFilePath(projectDir);
	const content = (await readTextOrNull(path)) ?? '';
	const stat = await statOrNull(path);
	return { content, updatedAt: stat ? stat.mtimeMs : null };
}

export async function writeProjectNotes(
	projectDir: string,
	content: string
): Promise<ProjectNotesResult> {
	const path = notesFilePath(projectDir);
	await mkdir(join(projectDir, '.aidd'), { recursive: true });
	await writeFile(path, content, 'utf8');
	recordDataMovement({
		category: 'file',
		operation: 'project.notes.write',
		status: 'hit',
		summary: { bytes: content.length },
		target: path,
	});
	return await readProjectNotes(projectDir);
}
