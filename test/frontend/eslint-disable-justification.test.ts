import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import ts from 'typescript';

const ROOT = join(import.meta.dir, '../..');
const FRONTEND_SRC = join(ROOT, 'frontend/src');

interface Comment {
	line: number;
	text: string;
}

/**
 * Every real comment in a source file, read from the TypeScript parser's trivia rather than by
 * pattern-matching lines, so a directive-shaped string literal or JSX text is never mistaken for
 * one and an inline comment after code is never missed.
 */
function comments(source: string): Comment[] {
	const file = ts.createSourceFile(
		'probe.tsx',
		source,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TSX,
	);
	const seen = new Map<number, Comment>();
	// JSX text is raw page copy; the trivia scanner would read a `/*` or `//` inside it as a comment.
	const jsxText: [number, number][] = [];
	function collect(ranges: ts.CommentRange[] | undefined): void {
		for (const range of ranges ?? []) {
			if (seen.has(range.pos)) continue;
			if (jsxText.some(([start, end]) => range.pos >= start && range.pos < end)) continue;
			const raw = source.slice(range.pos, range.end);
			const text =
				range.kind === ts.SyntaxKind.MultiLineCommentTrivia
					? raw.slice(2, -2).trim()
					: raw.slice(2).trim();
			seen.set(range.pos, {
				line: file.getLineAndCharacterOfPosition(range.pos).line + 1,
				text,
			});
		}
	}
	// Marked before any comment is collected: the text's `/*` is also where the opening tag's
	// trailing trivia begins, and that tag is visited first.
	function markJsxText(node: ts.Node): void {
		if (ts.isJsxText(node)) jsxText.push([node.pos, node.end]);
		for (const child of node.getChildren(file)) markJsxText(child);
	}
	function visit(node: ts.Node): void {
		collect(ts.getLeadingCommentRanges(source, node.pos));
		collect(ts.getTrailingCommentRanges(source, node.end));
		for (const child of node.getChildren(file)) visit(child);
	}
	markJsxText(file);
	visit(file);
	return [...seen.values()].sort((left, right) => left.line - right.line);
}

/** The rule list a block directive names, before any ` -- ` reason. Empty means every rule. */
function directiveRules(body: string): string {
	return (body.split(' -- ')[0] ?? '').trim();
}

/**
 * Directives that hide lint findings without saying why. A line directive (-next-line, -line) needs
 * a ` -- ` reason. A block disable silences everything after it, so it is accepted only as a scoped
 * pair: it names its rules, carries a reason, and a later eslint-enable comment re-enables exactly
 * those rules. A file-wide, bare or never-closed block disable is rejected wherever it sits.
 */
function unjustifiedDirectives(source: string): string[] {
	const all = comments(source);
	const problems: string[] = [];
	for (const [index, comment] of all.entries()) {
		const line = /^eslint-disable-(?:next-)?line(?![-\w])(.*)$/su.exec(comment.text);
		if (line) {
			if (!(line[1] ?? '').includes(' -- '))
				problems.push(`${comment.line}: no " -- " reason`);
			continue;
		}
		const block = /^eslint-disable(?![-\w])(.*)$/su.exec(comment.text);
		if (!block) continue;
		const body = block[1] ?? '';
		const rules = directiveRules(body);
		const closed = all.slice(index + 1).some((later) => {
			const enable = /^eslint-enable(?![-\w])(.*)$/su.exec(later.text);
			return enable !== null && directiveRules(enable[1] ?? '') === rules;
		});
		if (!rules || !body.includes(' -- ') || !closed)
			problems.push(`${comment.line}: broad block disable`);
	}
	return problems;
}

describe('eslint-disable directives in frontend/src', () => {
	test('the detector flags each unjustified form and passes a reasoned one', () => {
		expect(
			unjustifiedDirectives('/* eslint-disable react-hooks/refs */\nconst a = 1;'),
		).toEqual(['1: broad block disable']);
		// After a header and carrying a reason, an unclosed broad disable is still rejected.
		expect(
			unjustifiedDirectives(
				'// Header.\n\n/* eslint-disable react-hooks/refs -- whole file reads refs */\nx;',
			),
		).toEqual(['3: broad block disable']);
		// Inline after code on the same line is still a directive.
		expect(
			unjustifiedDirectives('const a = 1; /* eslint-disable a/rule -- why */\nx;'),
		).toEqual(['1: broad block disable']);
		expect(
			unjustifiedDirectives(
				'const a = <a>\n\t{/* eslint-disable some/rule -- why */}\n</a>;',
			),
		).toEqual(['2: broad block disable']);
		// A scoped pair passes only when a real enable comment names the same rules.
		const pair = (enable: string) =>
			`x;\n/* eslint-disable a/rule -- order is the UI order */\nconst s = 1;\n${enable}\n`;
		expect(unjustifiedDirectives(pair('/* eslint-enable a/rule */'))).toEqual([]);
		expect(unjustifiedDirectives(pair('/* eslint-enable b/rule */'))).toEqual([
			'2: broad block disable',
		]);
		// An enable-shaped string literal is not a comment and closes nothing.
		expect(unjustifiedDirectives(pair("const t = '/* eslint-enable a/rule */';"))).toEqual([
			'2: broad block disable',
		]);
		expect(
			unjustifiedDirectives('/* eslint-disable -- every rule */\nx;\n/* eslint-enable */'),
		).toEqual(['1: broad block disable']);
		expect(unjustifiedDirectives('x;\n\t// eslint-disable-next-line no-console\ny;')).toEqual([
			'2: no " -- " reason',
		]);
		expect(unjustifiedDirectives('x; // eslint-disable-line no-console\n')).toEqual([
			'1: no " -- " reason',
		]);
		expect(
			unjustifiedDirectives(
				'const a = <a>\n\t\t{/* eslint-disable-next-line some/rule */}\n</a>;',
			),
		).toEqual(['2: no " -- " reason']);
		expect(
			unjustifiedDirectives(
				'x;\n\t// eslint-disable-next-line no-console -- trace sink.\ny;',
			),
		).toEqual([]);
		expect(unjustifiedDirectives('// prose about a file-level eslint disable\n')).toEqual([]);
		// Directive-shaped JSX text is page copy, not a comment.
		expect(unjustifiedDirectives('const a = <p>/* eslint-disable all */</p>;')).toEqual([]);
	});

	test('every directive is line-scoped and carries a reason', async () => {
		const files = Array.from(new Bun.Glob('**/*.{ts,tsx}').scanSync(FRONTEND_SRC));
		expect(files.length).toBeGreaterThan(100);
		const failures: string[] = [];
		let directives = 0;
		for (const file of files) {
			const path = join(FRONTEND_SRC, file);
			const source = await readFile(path, 'utf8');
			directives += comments(source).filter((comment) =>
				comment.text.startsWith('eslint-'),
			).length;
			for (const problem of unjustifiedDirectives(source))
				failures.push(`${relative(ROOT, path)}:${problem}`);
		}
		// Positive control: the walk sees the directives the tree is known to carry.
		expect(directives).toBeGreaterThan(5);
		expect(failures).toEqual([]);
	});
});
