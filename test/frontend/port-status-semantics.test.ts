import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';

const pagesRoot = join(process.cwd(), 'frontend', 'src', 'pages');

// The three port-dot implementations. Each wraps an `aria-hidden` `StatusDot` in a `<span>` whose
// `aria-label` is the only non-colour statement of listening state. `aria-label` on a role-less
// generic span is prohibited (Lighthouse `aria-prohibited-attr`), so each wrapper must carry
// `role="img"` — a graphic named by its author — for the label to exist at all.
const portDotSites: { file: string; component: string }[] = [
	{ file: join('dashboard', 'ProjectHealthRow.tsx'), component: 'DashboardPortDot' },
	{ file: join('projects', 'ProjectsTableCells.tsx'), component: 'PortDot' },
	{ file: join('projects', 'ProjectCardMetrics.tsx'), component: 'PortDotInline' },
];

async function readSite(file: string): Promise<string> {
	return Bun.file(join(pagesRoot, file)).text();
}

/**
 * Extracts the first `<span>…</span>` element in a source string — each port-dot component's
 * labelled wrapper is the first span in its file.
 */
function firstSpan(source: string): string {
	const start = source.indexOf('<span');
	if (start === -1) throw new Error('<span not found');
	const end = source.indexOf('</span>', start);
	if (end === -1) throw new Error('closing </span> not found');
	return source.slice(start, end + '</span>'.length);
}

describe('port status labels are attached to named graphics', () => {
	test('every port-dot wrapper carries role="img" alongside its aria-label', async () => {
		for (const { file } of portDotSites) {
			const source = await readSite(file);
			const span = firstSpan(source);
			expect(span).toContain('aria-label=');
			expect(span).toContain('role="img"');
		}
	});

	test('each implementation defines one of the shared port-dot components', async () => {
		for (const { file, component } of portDotSites) {
			const source = await readSite(file);
			expect(source).toContain(`function ${component}(`);
		}
	});

	test('the dashboard dot keeps its Listening / Not listening accessible name and title', async () => {
		const source = await readSite(join('dashboard', 'ProjectHealthRow.tsx'));
		const span = firstSpan(source);
		expect(span).toContain("aria-label={listening ? 'Listening' : 'Not listening'}");
		expect(span).toContain("title={listening ? 'Listening' : 'Not listening'}");
	});

	test('the table dot keeps its Port listening / Port not listening name and title', async () => {
		const source = await readSite(join('projects', 'ProjectsTableCells.tsx'));
		const span = firstSpan(source);
		expect(span).toContain("aria-label={listening ? 'Port listening' : 'Port not listening'}");
		expect(span).toContain("title={listening ? 'Listening' : 'Not listening'}");
	});

	test('StatusDot stays aria-hidden inside every port-dot wrapper', async () => {
		for (const { file } of portDotSites) {
			const source = await readSite(file);
			expect(source).toContain('<StatusDot tone={listening');
			// `StatusDot` renders its own `aria-hidden` — verify the component keeps that contract
			// rather than duplicating it at each call site.
			const badge = await Bun.file(
				join(process.cwd(), 'frontend', 'src', 'components', 'ui', 'badge.tsx'),
			).text();
			expect(badge).toContain('aria-hidden');
		}
	});
});
