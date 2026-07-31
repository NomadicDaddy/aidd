import { describe, expect, test } from 'bun:test';
import {
	detectPrettierJsonStyle,
	PRETTIER_JSON_STYLE,
	printJson,
} from 'aidd-shared/metadata/json-format';
import { FileAiddStore } from 'aidd-shared/metadata/store';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { testTempDir } from '../_helpers/temp.ts';

// Byte-for-byte prettier output (useTabs, tabWidth 4, printWidth 100, jsonRecursiveSort) for a
// record exercising every branch: recursive key sort, a short array inlined, a long array broken,
// an array of objects broken regardless of width, and the empty collections.
const PRETTIER_RECORD = [
	'{',
	'\t"dependencies": ["control-panel-shell", "pwa-manifest-and-favicons"],',
	'\t"empties": {',
	'\t\t"list": [],',
	'\t\t"object": {}',
	'\t},',
	'\t"id": "about-page",',
	'\t"notes": [',
	'\t\t{',
	'\t\t\t"at": "2026-07-30T00:00:00.000Z",',
	'\t\t\t"text": "short"',
	'\t\t}',
	'\t],',
	'\t"widest": [',
	'\t\t"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",',
	'\t\t"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",',
	'\t\t"cccccccccccccccccccccccccccccccccccccccc"',
	'\t]',
	'}',
	'',
].join('\n');

describe('printJson', () => {
	test('reproduces prettier canonical output', () => {
		expect(printJson(JSON.parse(PRETTIER_RECORD))).toBe(PRETTIER_RECORD);
	});

	test('is a fixpoint — reprinting its own output changes nothing', () => {
		const once = printJson(JSON.parse(PRETTIER_RECORD));
		expect(printJson(JSON.parse(once))).toBe(once);
	});

	test('measures inlining against the column the value starts at, not the value alone', () => {
		// The same 86-column array fits at depth 1 and breaks once nesting pushes it right.
		const items = ['a'.repeat(39), 'b'.repeat(39)];
		expect(printJson({ k: items })).toContain('"k": ["aaa');
		expect(printJson({ a: { b: { c: { d: { k: items } } } } })).toContain('"k": [\n');
	});

	test('honors a space-indented style', () => {
		const style = { indent: '  ', indentWidth: 2, printWidth: 100 };
		expect(printJson({ b: 1, a: 2 }, style)).toBe('{\n  "a": 2,\n  "b": 1\n}\n');
	});
});

describe('detectPrettierJsonStyle', () => {
	test('reads the indentation unit off the first key line', () => {
		expect(detectPrettierJsonStyle(PRETTIER_RECORD)).toEqual(PRETTIER_JSON_STYLE);
		expect(detectPrettierJsonStyle('{\n  "a": 1,\n  "b": 2\n}\n')).toEqual({
			indent: '  ',
			indentWidth: 2,
			printWidth: 100,
		});
	});

	// The runtime serializer writes id-first, which is the signal that this file is not prettier's.
	test('declines a record whose keys are not sorted', () => {
		expect(detectPrettierJsonStyle('{\n\t"id": "x",\n\t"description": "y"\n}\n')).toBeNull();
	});

	test('declines input it cannot tell apart or parse', () => {
		expect(detectPrettierJsonStyle('{\n\t"only": 1\n}\n')).toBeNull();
		expect(detectPrettierJsonStyle('[1, 2]')).toBeNull();
		expect(detectPrettierJsonStyle('')).toBeNull();
		expect(detectPrettierJsonStyle('not json')).toBeNull();
	});
});

async function storeWith(contents: string, id = 'about-page'): Promise<[FileAiddStore, string]> {
	const projectDir = await testTempDir('aidd-json-format-');
	const path = join(projectDir, '.aidd', 'features', id, 'feature.json');
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, contents);
	return [new FileAiddStore(projectDir), path];
}

describe('FileAiddStore.writeFeature formatting', () => {
	test('keeps a prettier-formatted record prettier-formatted', async () => {
		const [store, path] = await storeWith(PRETTIER_RECORD);
		const feature = await store.readFeature('about-page');
		await store.writeFeature({ ...feature, priority: 3 });

		// Tabs kept, and the new key sorted into place rather than appended — a one-line diff.
		const written = await readFile(path, 'utf8');
		expect(written).toBe(
			PRETTIER_RECORD.replace('\t"widest": [', '\t"priority": 3,\n\t"widest": ['),
		);
	});

	test('leaves a runtime-serialized record on the runtime serializer', async () => {
		const runtime = `${JSON.stringify(
			{ id: 'about-page', title: 'About', description: 'About page', priority: 1 },
			null,
			2,
		)}\n`;
		const [store, path] = await storeWith(runtime);
		const feature = await store.readFeature('about-page');
		await store.writeFeature({ ...feature, priority: 3 });

		const written = await readFile(path, 'utf8');
		expect(written.startsWith('{\n  "id": "about-page",')).toBe(true);
		expect(written).toContain('"priority": 3');
	});

	test('imposes nothing on a project that has no record yet', async () => {
		const projectDir = await testTempDir('aidd-json-format-new-');
		const store = new FileAiddStore(projectDir);
		await store.writeFeature({ description: 'd', id: 'fresh', status: 'backlog', title: 't' });

		const written = await readFile(
			join(projectDir, '.aidd', 'features', 'fresh', 'feature.json'),
			'utf8',
		);
		expect(written.startsWith('{\n  "id": "fresh",')).toBe(true);
	});
});
