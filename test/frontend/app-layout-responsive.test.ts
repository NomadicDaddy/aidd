import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const appLayoutPath = join(
	process.cwd(),
	'frontend',
	'src',
	'components',
	'layout',
	'AppLayout.tsx',
);

describe('AppLayout responsive shell chrome', () => {
	test('keeps mobile actions in flow and compacts them at the supported minimum width', async () => {
		const source = await readFile(appLayoutPath, 'utf8');

		expect(source).not.toContain('absolute top-3 right-3');
		expect(source).toContain('max-sm:[&_button]:h-8 max-sm:[&_button]:w-8');
		expect(source).toContain("'min-w-0 truncate font-display");
		expect(source).toContain('gap-2 sm:contents');
	});

	test('stacks the collapsed desktop brand controls inside the rail', async () => {
		const source = await readFile(appLayoutPath, 'utf8');

		expect(source).toContain("collapsed ? 'sm:flex-col sm:gap-2'");
		expect(source).toContain("collapsed && 'sm:hidden'");
	});
});
