import { describe, expect, test } from 'bun:test';

import { parseMarkdownBlocks } from '../../frontend/src/lib/markdownBlocks.ts';

describe('parseMarkdownBlocks', () => {
	test('parses headings at levels 1-3', () => {
		const blocks = parseMarkdownBlocks('# One\n\n## Two\n\n### Three');
		expect(blocks).toEqual([
			{ level: 1, text: 'One', type: 'heading' },
			{ level: 2, text: 'Two', type: 'heading' },
			{ level: 3, text: 'Three', type: 'heading' },
		]);
	});

	test('groups consecutive list items into one block', () => {
		const blocks = parseMarkdownBlocks('- a\n- b\n- c');
		expect(blocks).toEqual([{ items: ['a', 'b', 'c'], ordered: false, type: 'list' }]);
	});

	test('detects ordered lists', () => {
		const blocks = parseMarkdownBlocks('1. first\n2. second');
		expect(blocks).toEqual([{ items: ['first', 'second'], ordered: true, type: 'list' }]);
	});

	test('folds hanging-indented continuation lines into the current item', () => {
		const blocks = parseMarkdownBlocks('1. first line\n   wrapped tail\n2. second');
		expect(blocks).toEqual([
			{ items: ['first line wrapped tail', 'second'], ordered: true, type: 'list' },
		]);
	});

	test('collects blockquote lines', () => {
		const blocks = parseMarkdownBlocks('> quoted line\n> second line');
		expect(blocks).toEqual([{ lines: ['quoted line', 'second line'], type: 'quote' }]);
	});

	test('joins wrapped paragraph lines and splits on blank lines', () => {
		const blocks = parseMarkdownBlocks('one\ntwo\n\nthree');
		expect(blocks).toEqual([
			{ text: 'one two', type: 'paragraph' },
			{ text: 'three', type: 'paragraph' },
		]);
	});

	test('recognizes a horizontal rule', () => {
		const blocks = parseMarkdownBlocks('above\n\n---\n\nbelow');
		expect(blocks).toContainEqual({ type: 'hr' });
	});

	test('strips a leading frontmatter fence', () => {
		const blocks = parseMarkdownBlocks("---\ntitle: 'X'\n---\n\n# Body");
		expect(blocks).toEqual([{ level: 1, text: 'Body', type: 'heading' }]);
	});
});
