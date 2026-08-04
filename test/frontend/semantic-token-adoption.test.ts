import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';

const colorUtility =
	'(?:bg|text|border|ring|divide|placeholder|from|via|to|fill|stroke|shadow|outline)';
const neutralFamily = '(?:neutral|gray|slate|zinc|stone)';
const rawNeutralClass = new RegExp(`${colorUtility}-${neutralFamily}-\\d+`, 'g');
const darkColorVariant = new RegExp(`dark:(?:[\\w[\\]=.-]+:)*${colorUtility}-`, 'g');

async function sourceFiles(root: string): Promise<string[]> {
	const glob = new Bun.Glob('**/*.{ts,tsx}');
	const files: string[] = [];
	for await (const file of glob.scan({ absolute: true, cwd: root, onlyFiles: true })) {
		files.push(file);
	}
	return files;
}

async function countMatches(files: string[], pattern: RegExp): Promise<number> {
	let count = 0;
	for (const file of files) {
		const source = await Bun.file(file).text();
		count += source.match(pattern)?.length ?? 0;
	}
	return count;
}

describe('semantic token adoption', () => {
	test('keeps raw neutral-family classes below the page-layer budget', async () => {
		const files = await sourceFiles(join(process.cwd(), 'frontend', 'src', 'pages'));
		const count = await countMatches(files, rawNeutralClass);

		expect(count).toBeLessThan(200);
	});

	test('keeps shared components free of dark color variants', async () => {
		const files = await sourceFiles(
			join(process.cwd(), 'frontend', 'src', 'components', 'shared'),
		);
		const count = await countMatches(files, darkColorVariant);

		expect(count).toBe(0);
	});
});
