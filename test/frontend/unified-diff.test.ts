import { describe, expect, test } from 'bun:test';

import { parseGitShow } from '../../frontend/src/lib/unifiedDiff.ts';

const sampleShow = [
	'commit 5714bf55aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
	'Author: aidd Test <test@example.com>',
	'Date:   Thu Jun 11 10:00:00 2026 -0500',
	'',
	'    feat(director): add launch preview dialog',
	'',
	' frontend/src/pages/director/LaunchPreview.tsx | 12 ++++++++----',
	' 1 file changed, 8 insertions(+), 4 deletions(-)',
	'',
	'diff --git a/frontend/src/pages/director/LaunchPreview.tsx b/frontend/src/pages/director/LaunchPreview.tsx',
	'index 1111111..2222222 100644',
	'--- a/frontend/src/pages/director/LaunchPreview.tsx',
	'+++ b/frontend/src/pages/director/LaunchPreview.tsx',
	'@@ -10,4 +10,4 @@ export function LaunchPreview() {',
	" import { Dialog } from '../ui/dialog.tsx'",
	'-const preview = null',
	'+const preview = usePreview(suggestion)',
	' return preview',
	'',
].join('\n');

describe('parseGitShow', () => {
	test('splits header from file sections and classifies lines', () => {
		const parsed = parseGitShow(sampleShow);
		expect(parsed.header).toContain('feat(director): add launch preview dialog');
		expect(parsed.header).toContain('1 file changed');
		expect(parsed.files).toHaveLength(1);
		const file = parsed.files[0];
		expect(file?.displayPath).toBe('frontend/src/pages/director/LaunchPreview.tsx');
		expect(file?.additions).toBe(1);
		expect(file?.deletions).toBe(1);
		expect(file?.isBinary).toBe(false);
		const kinds = file?.lines.map((line) => line.kind);
		expect(kinds).toContain('hunk');
		expect(kinds).toContain('add');
		expect(kinds).toContain('del');
		expect(kinds).toContain('context');
		expect(file?.lines[0]?.kind).toBe('meta');
	});

	test('handles multiple files', () => {
		const multi = [
			'commit abc',
			'',
			'diff --git a/one.txt b/one.txt',
			'index 1..2 100644',
			'--- a/one.txt',
			'+++ b/one.txt',
			'@@ -1 +1 @@',
			'-old',
			'+new',
			'diff --git a/two.txt b/two.txt',
			'index 3..4 100644',
			'--- a/two.txt',
			'+++ b/two.txt',
			'@@ -1 +1,2 @@',
			' kept',
			'+added',
			'',
		].join('\n');
		const parsed = parseGitShow(multi);
		expect(parsed.files).toHaveLength(2);
		expect(parsed.files[0]?.displayPath).toBe('one.txt');
		expect(parsed.files[1]?.displayPath).toBe('two.txt');
		expect(parsed.files[1]?.additions).toBe(1);
		expect(parsed.files[1]?.deletions).toBe(0);
	});

	test('labels renames with both paths', () => {
		const rename = [
			'commit abc',
			'',
			'diff --git a/old-name.ts b/new-name.ts',
			'similarity index 95%',
			'rename from old-name.ts',
			'rename to new-name.ts',
			'index 1..2 100644',
			'--- a/old-name.ts',
			'+++ b/new-name.ts',
			'@@ -1 +1 @@',
			'-a',
			'+b',
		].join('\n');
		const parsed = parseGitShow(rename);
		expect(parsed.files[0]?.displayPath).toBe('old-name.ts → new-name.ts');
	});

	test('flags binary files', () => {
		const binary = [
			'commit abc',
			'',
			'diff --git a/logo.png b/logo.png',
			'index 1..2 100644',
			'Binary files a/logo.png and b/logo.png differ',
		].join('\n');
		const parsed = parseGitShow(binary);
		expect(parsed.files[0]?.isBinary).toBe(true);
		expect(parsed.files[0]?.additions).toBe(0);
	});

	test('does not misclassify content lines that resemble metadata inside hunks', () => {
		const tricky = [
			'commit abc',
			'',
			'diff --git a/notes.md b/notes.md',
			'index 1..2 100644',
			'--- a/notes.md',
			'+++ b/notes.md',
			'@@ -1,2 +1,3 @@',
			' index entries are listed here',
			'+rename to something descriptive',
			' tail',
		].join('\n');
		const parsed = parseGitShow(tricky);
		const file = parsed.files[0];
		expect(file?.displayPath).toBe('notes.md');
		expect(file?.additions).toBe(1);
		const contentLine = file?.lines.find((line) => line.text.startsWith(' index entries'));
		expect(contentLine?.kind).toBe('context');
	});

	test('returns empty structures for empty input', () => {
		expect(parseGitShow('')).toEqual({ files: [], header: '' });
	});

	test('counts new and deleted files', () => {
		const created = [
			'commit abc',
			'',
			'diff --git a/created.txt b/created.txt',
			'new file mode 100644',
			'index 0000000..1111111',
			'--- /dev/null',
			'+++ b/created.txt',
			'@@ -0,0 +1,2 @@',
			'+line one',
			'+line two',
		].join('\n');
		const parsed = parseGitShow(created);
		expect(parsed.files[0]?.additions).toBe(2);
		expect(parsed.files[0]?.deletions).toBe(0);
	});
});
