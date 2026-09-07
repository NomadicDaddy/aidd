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
		expect(row).toContain('historyKindLabels[event.kind]');
		expect(row).toContain('sm:grid-cols-[minmax(18rem,1fr)_8rem_8rem_auto]');
		expect(row).toContain('event.badgeTone');
	});

	test('contains commit detail and leaves the dated group to carry age', async () => {
		const source = await Bun.file(historyPath).text();

		expect(source).toContain('event.commits.length > 0');
		expect(source).toContain('<CommitChips commits={event.commits}');
		expect(source).toContain('`mt-1 space-y-2 pl-4 ${proseMeasureClass}`');
		expect(source).not.toContain('RelativeAge');
	});

	test('uses a section heading without duplicating its accessible label', async () => {
		const source = await Bun.file(historyPath).text();

		expect(source).toContain('<section key={group.key}>');
		expect(source).toContain('headingLevel={3}');
		// Section, not subsection: the divider is the container for the rows beneath it and
		// at the subsection rank it sat one weight step from an event title of the same size.
		expect(source).toContain('level="section"');
		expect(source).toContain('title={group.label}');
		expect(source).toContain('sticky top-[var(--app-topbar-height,0px)]');
		expect(source).not.toContain('aria-label={group.label}');
	});

	test('gives every event title a resolvable destination', async () => {
		const source = await Bun.file(historyPath).text();

		expect(source).toContain('WEB_RUN_ID_PATTERN.test(event.runId)');
		expect(source).toContain('&run=${encodeURIComponent(event.runId)}');
		expect(source).toContain('const link = eventLink(event, projectPath)');
		expect(source).toContain('return `/runs?project=${project}`');
		expect(source).not.toContain('link ? (');
	});
});
