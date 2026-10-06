import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const ROOT = join(import.meta.dir, '../..');
const FRONTEND_SRC = join(ROOT, 'frontend/src');

// A directive comment, in line, block or JSX-expression form, at the start of a line.
const DIRECTIVE = /^\s*(?:\/\/|\/\*|\{\/\*)\s*eslint-disable(?:-next-line|-line)?\b/u;

/**
 * Directives that hide lint findings without saying why. A file-wide block disable on line 1 is
 * rejected outright: it silences every later violation in the file, reasoned or not.
 */
function unjustifiedDirectives(source: string): string[] {
	const problems: string[] = [];
	source.split('\n').forEach((line, index) => {
		if (!DIRECTIVE.test(line)) return;
		if (index === 0 && /^\/\*\s*eslint-disable\b(?!-)/u.test(line)) {
			problems.push(`${index + 1}: file-wide block disable`);
		} else if (!line.includes(' -- ')) {
			problems.push(`${index + 1}: no " -- " reason`);
		}
	});
	return problems;
}

describe('eslint-disable directives in frontend/src', () => {
	test('the detector flags each unjustified form and passes a reasoned one', () => {
		expect(
			unjustifiedDirectives('/* eslint-disable react-hooks/refs */\nconst a = 1;'),
		).toEqual(['1: file-wide block disable']);
		expect(unjustifiedDirectives('x;\n\t// eslint-disable-next-line no-console\ny;')).toEqual([
			'2: no " -- " reason',
		]);
		expect(
			unjustifiedDirectives('x;\n\t\t{/* eslint-disable-next-line some/rule */}\n<a />'),
		).toEqual(['2: no " -- " reason']);
		expect(
			unjustifiedDirectives(
				'x;\n\t// eslint-disable-next-line no-console -- trace sink.\ny;',
			),
		).toEqual([]);
		expect(unjustifiedDirectives('// prose about a file-level eslint disable\n')).toEqual([]);
	});

	test('every directive is line-scoped and carries a reason', async () => {
		const files = Array.from(new Bun.Glob('**/*.{ts,tsx}').scanSync(FRONTEND_SRC));
		expect(files.length).toBeGreaterThan(100);
		const failures: string[] = [];
		for (const file of files) {
			const path = join(FRONTEND_SRC, file);
			const problems = unjustifiedDirectives(await readFile(path, 'utf8'));
			for (const problem of problems) failures.push(`${relative(ROOT, path)}:${problem}`);
		}
		expect(failures).toEqual([]);
	});
});
