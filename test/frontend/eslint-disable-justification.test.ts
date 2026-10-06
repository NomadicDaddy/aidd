import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const ROOT = join(import.meta.dir, '../..');
const FRONTEND_SRC = join(ROOT, 'frontend/src');

// A directive comment, in line, block or JSX-expression form, at the start of a line.
const DIRECTIVE = /^\s*(?:\/\/|\/\*|\{\/\*)\s*eslint-disable(?:-next-line|-line)?\b/u;
// The block form, `eslint-disable` itself rather than its -next-line or -line variants; group 1 is
// whatever follows it inside the comment.
const BLOCK_DISABLE = /^\s*\{?\/\*\s*eslint-disable(?![-\w])(.*?)\*\//u;

/** The rule list a block directive names, before any ` -- ` reason. Empty means every rule. */
function blockRules(body: string): string {
	return (body.split(' -- ')[0] ?? '').trim();
}

/**
 * Directives that hide lint findings without saying why. A block disable silences everything
 * after it, so it is accepted only as a scoped pair: it names its rules, carries a ` -- ` reason,
 * and a later `eslint-enable` re-enables exactly those rules. A file-wide or never-closed block
 * disable is rejected wherever it sits, reasoned or not.
 */
function unjustifiedDirectives(source: string): string[] {
	const lines = source.split('\n');
	const problems: string[] = [];
	lines.forEach((line, index) => {
		if (!DIRECTIVE.test(line)) return;
		const block = BLOCK_DISABLE.exec(line);
		if (block) {
			const body = block[1] ?? '';
			const rules = blockRules(body);
			const closed = lines
				.slice(index + 1)
				.some(
					(later) =>
						/eslint-enable(?![-\w])(.*?)\*\//u.exec(later)?.[1]?.trim() === rules,
				);
			if (!rules || !body.includes(' -- ') || !closed)
				problems.push(`${index + 1}: broad block disable`);
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
		).toEqual(['1: broad block disable']);
		// After a header and carrying a reason, a broad disable is still rejected.
		expect(
			unjustifiedDirectives(
				'// Header.\n\n/* eslint-disable react-hooks/refs -- whole file reads refs */\nx;',
			),
		).toEqual(['3: broad block disable']);
		expect(
			unjustifiedDirectives('<a>\n\t{/* eslint-disable some/rule -- why */}\n</a>'),
		).toEqual(['2: broad block disable']);
		// A scoped pair passes only when the enable names the same rules as the reasoned disable.
		const pair = (enable: string) =>
			`x;\n/* eslint-disable a/rule -- order is the UI order */\nconst s = 1;\n${enable}\n`;
		expect(unjustifiedDirectives(pair('/* eslint-enable a/rule */'))).toEqual([]);
		expect(unjustifiedDirectives(pair('/* eslint-enable b/rule */'))).toEqual([
			'2: broad block disable',
		]);
		expect(
			unjustifiedDirectives('/* eslint-disable -- every rule */\nx;\n/* eslint-enable */'),
		).toEqual(['1: broad block disable']);
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
