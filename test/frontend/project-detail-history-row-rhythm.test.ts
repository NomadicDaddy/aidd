import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';

const historyPath = join(
	process.cwd(),
	'frontend',
	'src',
	'pages',
	'projects',
	'detail',
	'HistoryTab.tsx',
);

describe('Project Detail History row rhythm', () => {
	test('leads every row with its title and keeps lifecycle metadata inline', async () => {
		const source = await Bun.file(historyPath).text();
		const row = source.slice(
			source.indexOf('function HistoryEventRow'),
			source.indexOf('\n}\n\nexport'),
		);
		const title = row.indexOf('<Link');
		const badge = row.indexOf('<Badge');

		expect(title).toBeGreaterThan(-1);
		expect(badge).toBeGreaterThan(title);
		expect(row).toContain("const isRun = event.kind === 'run'");
		expect(row).toContain('className="text-xs text-muted-foreground"');
	});

	test('caps run summaries and leaves the dated group to carry age', async () => {
		const source = await Bun.file(historyPath).text();

		expect(source).toContain('index === event.detailParts.length - 1');
		expect(source).toContain('`min-w-0 break-words ${proseMeasureClass}`');
		expect(source).not.toContain('RelativeAge');
	});

	test('uses a subsection heading without duplicating its accessible label', async () => {
		const source = await Bun.file(historyPath).text();

		expect(source).toContain('<section key={group.key}>');
		expect(source).toContain('headingLevel={3}');
		expect(source).toContain('level="subsection"');
		expect(source).toContain('title={group.label}');
		expect(source).not.toContain('aria-label={group.label}');
	});
});
