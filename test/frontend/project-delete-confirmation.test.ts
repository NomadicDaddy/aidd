import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const DELETE_PROJECT_CARD = resolve(
	import.meta.dir,
	'../../frontend/src/pages/projects/detail/DeleteProjectCard.tsx',
);

describe('project delete confirmation', () => {
	test('changing delete mode clears the typed path in the same transition', async () => {
		const source = await readFile(DELETE_PROJECT_CARD, 'utf8');
		const modeChangeHandler = source.match(
			/onChange=\{\(event\) => \{([\s\S]*?)\}\}\s+value=\{deleteMode\}/u,
		)?.[1];

		expect(modeChangeHandler).toContain(
			'setDeleteMode(event.target.value as ProjectDeleteMode);',
		);
		expect(modeChangeHandler).toContain("setDeleteConfirmation('');");
	});
});
