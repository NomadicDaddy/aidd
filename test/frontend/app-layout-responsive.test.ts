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
const appBrandPath = join(process.cwd(), 'frontend', 'src', 'components', 'layout', 'AppBrand.tsx');

describe('AppLayout responsive shell chrome', () => {
	test('keeps mobile actions in flow and lets the brand yield the width', async () => {
		const [brand, source] = await Promise.all([
			readFile(appBrandPath, 'utf8'),
			readFile(appLayoutPath, 'utf8'),
		]);

		expect(source).not.toContain('absolute top-3 right-3');
		expect(brand).toContain('flex min-w-0 items-center gap-2');
		expect(brand).toContain('truncate font-display');
		expect(source).toContain('gap-2 sm:contents');

		// This row must not carry `max-sm:[&_button]:h-8 max-sm:[&_button]:w-8`, which shrinks its
		// icon buttons to 32px on exactly the viewport where a finger is the pointer. The row fits at the
		// supported minimum without it — five 44px controls and their gaps are 228px of a 288px
		// content column at 320px — and the brand beside them is what yields, which is what the
		// `min-w-0 truncate` above is for. Enforced generally in touch-targets.test.ts.
		expect(source).not.toContain('max-sm:[&_button]:');
	});

	test('stacks the collapsed desktop brand controls inside the rail', async () => {
		const [brand, source] = await Promise.all([
			readFile(appBrandPath, 'utf8'),
			readFile(appLayoutPath, 'utf8'),
		]);

		expect(source).toContain("collapsed ? 'sm:flex-col sm:gap-2'");
		expect(brand).toContain("collapsed && 'sm:hidden'");
	});
});
