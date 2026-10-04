import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Escape or a backdrop click on these dialogs dropped whatever had been typed, without a word. Each
 * now hands Dialog the guard's requestClose, which asks first when the form is dirty and closes at
 * once when it is clean. An explicit Cancel stays a direct close: pressing it is the operator
 * choosing to discard, so it is deliberately not asserted here.
 */
const read = (path: string): string =>
	readFileSync(resolve(process.cwd(), 'frontend', 'src', path), 'utf8');

const DIALOGS = [
	'pages/projects/detail/FeatureDetailsDialog.tsx',
	'pages/projects/detail/FindingDismissalDialog.tsx',
	'pages/projects/detail/MilestoneFormDialog.tsx',
	'pages/projects/detail/workingTree/CommitMessageDialog.tsx',
];

describe('form dialogs ask before an accidental exit discards typing', () => {
	test.each(DIALOGS)('%s closes through the guard', (path) => {
		const source = read(path);
		expect(source).toMatch(
			/import \{ useGuardedClose \} from '[./]+\/hooks\/useGuardedClose\.tsx';/u,
		);
		expect(source).toContain('useGuardedClose({');
		expect(source).toContain('onClose={guard.requestClose}');
		// The raw callback never reaches Dialog, which is where Escape and the backdrop land.
		expect(source).not.toMatch(/<Dialog\b[^>]*\bonClose=\{onClose\}/u);
		// The confirmation has to be rendered for requestClose to have anything to open.
		expect(source).toContain('{guard.discardDialog}');
	});

	test('the guard asks only when something would be lost', () => {
		const hook = read('hooks/useGuardedClose.tsx');
		expect(hook).toContain('if (dirty) setAsking(true);');
		expect(hook).toContain('else onClose();');
		expect(hook).toContain('title="Discard unsaved changes?"');
	});
});
