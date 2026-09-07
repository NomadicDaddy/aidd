import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { projectDirectoryNameError } from '../../frontend/src/pages/projects/detail/managementPaths.ts';

const MOVE_PROJECT_CARD = resolve(
	import.meta.dir,
	'../../frontend/src/pages/projects/detail/MoveProjectCard.tsx',
);

describe('project move guards', () => {
	test('rejects path separators and traversal names without rejecting ordinary dots', () => {
		expect(projectDirectoryNameError('../aidd-escaped')).not.toBeNull();
		expect(projectDirectoryNameError('..\\aidd-escaped')).not.toBeNull();
		expect(projectDirectoryNameError('.')).not.toBeNull();
		expect(projectDirectoryNameError('..')).not.toBeNull();
		expect(projectDirectoryNameError('nested/project')).not.toBeNull();
		expect(projectDirectoryNameError('nested\\project')).not.toBeNull();
		expect(projectDirectoryNameError('aidd-backup')).toBeNull();
		expect(projectDirectoryNameError('aidd..backup')).toBeNull();
	});

	test('blocks dispatch and preview until the typed confirmation and folder name are valid', async () => {
		const source = await readFile(MOVE_PROJECT_CARD, 'utf8');

		expect(source).toContain('!confirmationMatches ||');
		expect(source).toContain('Boolean(destinationNameError) ||');
		expect(source).toContain('if (moveDisabled) return;');
		expect(source).toContain('confirmation,');
		expect(source).toContain('error={confirmationError}');
		expect(source).toContain('error={destinationNameError}');
		expect(source).toContain('destinationRoot && !destinationNameError');
	});
});
