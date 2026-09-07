import { describe, expect, test } from 'bun:test';
import { join, resolve } from 'node:path';

import {
	describeByteSlice,
	describeOutputSlice,
	formatOutputSlice,
} from '../../frontend/src/lib/outputSlice.ts';

const ROOT = resolve(import.meta.dir, '../..');

function read(path: string): Promise<string> {
	return Bun.file(join(ROOT, path)).text();
}

describe('truncated output declares the omitted byte count', () => {
	test('uses UTF-8 bytes and never reports a negative omission from a stale total', () => {
		expect(describeOutputSlice('A界', 10)).toEqual({
			omittedBytes: 6,
			shownBytes: 4,
			totalBytes: 10,
		});
		expect(describeByteSlice(12, 10)).toEqual({
			omittedBytes: 0,
			shownBytes: 12,
			totalBytes: 12,
		});
	});

	test('names the displayed tail, total, and omitted amount', () => {
		expect(formatOutputSlice(describeByteSlice(2 * 1024, 5 * 1024), 'most recent')).toBe(
			'Showing the most recent 2 KB of 5 KB — 3 KB omitted.',
		);
		expect(formatOutputSlice(describeByteSlice(5, 5), 'first')).toBeNull();
	});

	test('the terminal step console discloses its slice and opens at the tail', async () => {
		const console_ = await read('frontend/src/pages/pipelineSessions/RunConsoleBody.tsx');
		const logPre = await read('frontend/src/pages/pipelineSessions/LogPre.tsx');

		expect(console_).toContain("formatOutputSlice(slice, 'most recent')");
		expect(console_).toContain('{sliceMeta ? (');
		expect(console_).toContain('{sliceMeta}</span>');
		expect(console_).toContain('startAtEnd={hasContent}');
		expect(console_).toContain('Expands ${formatBytes(slice.shownBytes)} inline on this page.');
		expect(logPre).toContain('node.scrollTop = node.scrollHeight');
		expect(logPre).toContain("expandLabel = 'Show full output'");
		expect(logPre).toContain('aria-describedby={meta ? metaId : undefined}');
		expect(logPre).toContain('aria-describedby={!expanded && expansionHint');
	});

	test('the Runs console and code viewer use the same byte-slice disclosure', async () => {
		const notices = await read('frontend/src/pages/runs/LiveConsoleNotices.tsx');
		const codeViewer = await read('frontend/src/pages/projects/detail/CodeFileViewer.tsx');

		expect(notices).toContain("formatOutputSlice(slice, 'most recent')");
		expect(notices).toContain('showWindowNotice && slice.omittedBytes > 0');
		expect(codeViewer).toContain("formatOutputSlice(slice, 'first')");
		expect(codeViewer).not.toContain('formatBytes(data.content.length)');
	});
});
