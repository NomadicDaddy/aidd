import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

describe('runs page section order', () => {
	test('renders Live Console between Active and History', async () => {
		const source = await readFile(
			join(import.meta.dir, '..', '..', 'frontend', 'src', 'pages', 'runs', 'RunsPage.tsx'),
			'utf8',
		);
		const activeIndex = source.indexOf('title="Active"');
		const consoleIndex = source.indexOf('ref={page.liveConsoleRef}');
		const historyIndex = source.indexOf('title="History"');
		const showMoreIndex = source.indexOf("'Show more'");

		expect(activeIndex).toBeGreaterThan(-1);
		expect(consoleIndex).toBeGreaterThan(activeIndex);
		expect(historyIndex).toBeGreaterThan(consoleIndex);
		expect(showMoreIndex).toBeGreaterThan(historyIndex);
	});
});
