import { describe, expect, test } from 'bun:test';
import { join, resolve } from 'node:path';

import { GRAPH_NODE_HEIGHT } from '../../frontend/src/pages/projects/detail/dependencyGraphTypes.ts';

const SRC = resolve(import.meta.dir, '../../frontend/src');
const NODE_FILE = join(SRC, 'pages/projects/detail/dependencyGraphComponents.tsx');

/**
 * A node card is placed at an absolute height the layout picked, and it draws a badge row, a title
 * and the feature id. Those two numbers were 82 and 96, so every visible node clipped its own id
 * horizontally through the glyphs — and the id is the only thing that identifies a node.
 */
describe('a dependency graph node fits what it draws', () => {
	test('the declared height is the height of the content', () => {
		// Re-done here rather than trusted, so a change to the type scale inside a node fails in a
		// test instead of in a screenshot. `box-sizing: border-box`, hence the two border pixels.
		const padding = 12 + 12; // p-3
		const badgeRow = 4 + 16 + 4; // py-1 around a text-xs line
		const title = 8 + 20; // mt-2, then a text-sm line
		const id = 4 + 16; // mt-1, then a text-xs line
		const border = 1 + 1;

		expect(GRAPH_NODE_HEIGHT).toBe(padding + badgeRow + title + id + border);
	});

	test('both text lines are one line each, so neither pushes the other out of the box', async () => {
		const source = await Bun.file(NODE_FILE).text();
		const button = source.slice(
			source.indexOf('export function GraphNodeButton'),
			source.indexOf('export function DependencyList'),
		);

		expect(button).toContain('truncate text-sm font-semibold');
		expect(button).toContain('truncate font-mono text-xs');
		// The card still clips, so a browser that disagrees about a line box by a pixel cuts
		// cleanly at the border rather than spilling over the node beneath it.
		expect(button).toContain('overflow-hidden');
	});

	test('an ellipsised line can still be read in full', async () => {
		const source = await Bun.file(NODE_FILE).text();
		const button = source.slice(
			source.indexOf('export function GraphNodeButton'),
			source.indexOf('export function DependencyList'),
		);

		expect(button).toContain('title={node.title}');
		expect(button).toContain('title={node.directory}');
		// Status, layer, title and directory are all visible button content. An overriding label
		// would discard three of those four facts from the accessibility tree.
		expect(button).not.toContain('aria-label=');
	});
});
