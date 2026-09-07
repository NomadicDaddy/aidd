import { describe, expect, test } from 'bun:test';
import { relative, resolve } from 'node:path';
import ts from 'typescript';

const frontendRoot = resolve(process.cwd(), 'frontend', 'src');
const genericTags = new Set(['div', 'span']);
const nameAttributes = new Set(['aria-label', 'aria-labelledby']);

function attributeNames(node: ts.JsxOpeningElement | ts.JsxSelfClosingElement): Set<string> {
	return new Set(
		node.attributes.properties.flatMap((attribute) =>
			ts.isJsxAttribute(attribute) ? [attribute.name.getText()] : [],
		),
	);
}

function unnameableGenericElements(file: string, source: string): string[] {
	const sourceFile = ts.createSourceFile(
		file,
		source,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TSX,
	);
	const violations: string[] = [];

	function visit(node: ts.Node): void {
		if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
			const tag = node.tagName.getText(sourceFile);
			const attributes = attributeNames(node);
			const carriesName = [...nameAttributes].some((name) => attributes.has(name));
			if (genericTags.has(tag) && carriesName && !attributes.has('role')) {
				const { line } = sourceFile.getLineAndCharacterOfPosition(
					node.getStart(sourceFile),
				);
				violations.push(`${relative(frontendRoot, file)}:${line + 1}`);
			}
		}
		ts.forEachChild(node, visit);
	}

	visit(sourceFile);
	return violations;
}

describe('accessible names on generic elements', () => {
	test('requires an explicit nameable role on labelled div and span elements', async () => {
		const violations: string[] = [];
		const files = new Bun.Glob('**/*.tsx').scan({ cwd: frontendRoot, onlyFiles: true });
		for await (const relativeFile of files) {
			const file = resolve(frontendRoot, relativeFile);
			violations.push(...unnameableGenericElements(file, await Bun.file(file).text()));
		}

		expect(violations).toEqual([]);
	});
});
