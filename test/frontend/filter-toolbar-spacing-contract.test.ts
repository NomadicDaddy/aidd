import { describe, expect, test } from 'bun:test';
import { join, resolve } from 'node:path';
import ts from 'typescript';

const frontendRoot = resolve(import.meta.dir, '../../frontend');
const sourceRoot = join(frontendRoot, 'src');

function renderSpacingVariants(): Record<'compact' | 'default', string> {
	const script = `
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FilterToolbar } from './src/components/shared/FilterToolbar.tsx';
import { PageRail } from './src/components/shared/PageRail.tsx';

const render = (spacing) => renderToStaticMarkup(createElement(
	PageRail,
	{ rail: 'full' },
	createElement(
		FilterToolbar,
		{
			columns: 'grid-cols-1',
			filtered: 1,
			gap: spacing,
			hasFilters: false,
			noun: 'items',
			onReset: () => {},
			padding: spacing,
			total: 1,
		},
		createElement('input'),
	),
));
console.log(JSON.stringify({ compact: render('compact'), default: render('default') }));
`;
	const result = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: frontendRoot,
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
	return JSON.parse(new TextDecoder().decode(result.stdout).trim()) as Record<
		'compact' | 'default',
		string
	>;
}

describe('filter toolbar spacing contract', () => {
	test('renders documented gap and padding defaults and the compact alternative', () => {
		const markup = renderSpacingVariants();

		expect(markup.default).toContain('class="@container"');
		expect(markup.default).toContain('flex flex-col gap-3');
		expect(markup.default).toContain('p-4 @max-[36rem]:p-3');
		expect(markup.default).toContain('@max-[36rem]:gap-2');
		expect(markup.compact).toContain('flex flex-col gap-2 p-3');
	});

	test('keeps internal spacing out of every call site', async () => {
		const glob = new Bun.Glob('**/*.tsx');
		const offenders: string[] = [];
		const internalSpacing = /(?:^|\s)(?:gap(?:-[xy])?|p[trblxy]?)-\S+/u;

		for await (const file of glob.scan({ cwd: sourceRoot, onlyFiles: true })) {
			const text = await Bun.file(join(sourceRoot, file)).text();
			const source = ts.createSourceFile(
				file,
				text,
				ts.ScriptTarget.Latest,
				true,
				ts.ScriptKind.TSX,
			);
			const visit = (node: ts.Node): void => {
				if (
					ts.isJsxOpeningElement(node) &&
					node.tagName.getText(source) === 'FilterToolbar'
				) {
					const className = node.attributes.properties.find(
						(property) =>
							ts.isJsxAttribute(property) &&
							property.name.getText(source) === 'className',
					);
					if (
						className !== undefined &&
						internalSpacing.test(className.getText(source))
					) {
						offenders.push(file.replaceAll('\\', '/'));
					}
				}
				ts.forEachChild(node, visit);
			};
			visit(source);
		}

		expect(offenders).toEqual([]);
	});
});
