import { describe, expect, test } from 'bun:test';

import { diaryEntryId, parseDiaryEntry } from '../../backend/src/services/diary/parse.ts';

const base = {
	entryDate: '2026-06-12',
	fileMtimeMs: 1_700_000_000_000,
	filePath: 'd:/applications/demo/.aidd/diary/2026/06/12.md',
	projectName: 'demo',
	projectPath: 'd:/applications/demo',
};

function body(frontmatter: string, content: string): string {
	return `---\n${frontmatter}\n---\n\n${content}`;
}

describe('parseDiaryEntry', () => {
	test('parses frontmatter fields and computes a stable id', () => {
		const parsed = parseDiaryEntry({
			...base,
			body: body(
				"date: 2026-06-12\nproject: demo\ntitle: 'The Reconcile Refactor'\nphase: Backend\nsummary: 'Indexing landed.'",
				'# Friday, June 12, 2026 — The Reconcile Refactor\n\nBody.'
			),
		});
		expect('error' in parsed).toBe(false);
		if ('error' in parsed) return;
		expect(parsed.title).toBe('The Reconcile Refactor');
		expect(parsed.phase).toBe('Backend');
		expect(parsed.summary).toBe('Indexing landed.');
		expect(parsed.id).toBe(diaryEntryId(base.projectPath, base.entryDate));
		expect(parsed.contentHash.length).toBeGreaterThan(0);
	});

	test('falls back to the H1 when no frontmatter title is present', () => {
		const parsed = parseDiaryEntry({
			...base,
			body: '# A Day Without Frontmatter Title\n\nBody.',
		});
		expect('error' in parsed).toBe(false);
		if ('error' in parsed) return;
		expect(parsed.title).toBe('A Day Without Frontmatter Title');
	});

	test('rejects a frontmatter date that disagrees with the path date', () => {
		const parsed = parseDiaryEntry({
			...base,
			body: body("date: 2026-06-13\ntitle: 'Mismatch'", '# Mismatch'),
		});
		expect('error' in parsed).toBe(true);
	});

	test('rejects an entry with neither frontmatter title nor H1', () => {
		const parsed = parseDiaryEntry({ ...base, body: 'just a paragraph, no heading' });
		expect('error' in parsed).toBe(true);
	});

	test('drops an unknown phase value rather than failing', () => {
		const parsed = parseDiaryEntry({
			...base,
			body: body("title: 'X'\nphase: Nonsense", '# X'),
		});
		expect('error' in parsed).toBe(false);
		if ('error' in parsed) return;
		expect(parsed.phase).toBeNull();
	});

	test('content hash is stable for identical bodies and differs on change', () => {
		const a = parseDiaryEntry({ ...base, body: body("title: 'X'", '# X\n\nsame') });
		const b = parseDiaryEntry({ ...base, body: body("title: 'X'", '# X\n\nsame') });
		const c = parseDiaryEntry({ ...base, body: body("title: 'X'", '# X\n\ndifferent') });
		if ('error' in a || 'error' in b || 'error' in c) throw new Error('unexpected parse error');
		expect(a.contentHash).toBe(b.contentHash);
		expect(a.contentHash).not.toBe(c.contentHash);
	});

	test('id folds slash and case so path variants collapse to one id', () => {
		expect(diaryEntryId('D:\\applications\\Demo', '2026-06-12')).toBe(
			diaryEntryId('d:/applications/demo', '2026-06-12')
		);
	});
});
