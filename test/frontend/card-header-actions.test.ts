import { describe, expect, test } from 'bun:test';
import { join, resolve } from 'node:path';

const frontendSource = join(process.cwd(), 'frontend', 'src');

function read(...segments: string[]): Promise<string> {
	return Bun.file(join(frontendSource, ...segments)).text();
}

function renderCardHeader(
	actionLayout: 'default' | 'stacked',
	includeStatus = false,
	headingLevel = 2,
): string {
	const script = [
		"import { createElement } from 'react';",
		"import { renderToStaticMarkup } from 'react-dom/server';",
		"import { CardHeader } from './src/components/ui/card.tsx';",
		"const action = createElement('button', { className: 'w-full', type: 'button' }, 'Wide action');",
		"const status = createElement('span', null, 'Ready');",
		'const header = createElement(CardHeader, {',
		'\taction,',
		`\tactionLayout: ${JSON.stringify(actionLayout)},`,
		"\tdescription: 'Persistent description',",
		`\theadingLevel: ${headingLevel},`,
		...(includeStatus ? ['\tstatus,'] : []),
		"\ttitle: 'Card identity',",
		'});',
		'console.log(renderToStaticMarkup(header));',
	].join('\n');
	const result = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: resolve(import.meta.dir, '../../frontend'),
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
	return new TextDecoder().decode(result.stdout).trim();
}

const consumers = [
	['pages', 'audits', 'tabs', 'ApplicabilityTab.tsx'],
	['pages', 'projects', 'detail', 'AuditsTab.tsx'],
	['pages', 'projects', 'detail', 'DiaryTab.tsx'],
	['pages', 'settings', 'SettingsRuntimeControls.tsx'],
] as const;

describe('container-aware CardHeader actions', () => {
	test('keeps opted-in action headers vertical below 32rem', async () => {
		const card = await read('components', 'ui', 'card.tsx');

		expect(card).toContain("type CardHeaderActionLayout = 'default' | 'stacked';");
		expect(card).toContain("actionLayout = 'default'");
		expect(card).toContain("hasAction && actionLayout === 'stacked'");
		expect(card).toContain("? '@container'");
		expect(card).toContain(
			'flex flex-col items-stretch justify-between gap-3 @min-[32rem]:flex-row @min-[32rem]:flex-wrap @min-[32rem]:items-start',
		);
	});

	test('protects the card identity floor and wraps a natural-width action', () => {
		const defaultLayout = renderCardHeader('default');
		const stackedLayout = renderCardHeader('stacked');

		expect(defaultLayout).toContain('min-w-[min(100%,16rem)] basis-64');
		expect(stackedLayout).toContain(
			'@min-[32rem]:min-w-[min(100%,16rem)] @min-[32rem]:basis-64',
		);
		for (const rendered of [defaultLayout, stackedLayout]) {
			expect(rendered).toContain('class="max-w-full shrink-0"');
			expect(rendered).toContain('Persistent description');
		}
	});

	test('keeps status readouts in the identity rail and commands in the action rail', async () => {
		const [card, scheduled] = await Promise.all([
			read('components', 'ui', 'card.tsx'),
			read('pages', 'scheduled', 'ScheduledTaskCard.tsx'),
		]);
		const rendered = renderCardHeader('default', true);
		const statusAt = rendered.indexOf('data-slot="card-header-status"');
		const actionsAt = rendered.indexOf('data-slot="card-header-actions"');

		expect(card).toContain('status?: ReactNode;');
		expect(statusAt).toBeGreaterThan(-1);
		expect(actionsAt).toBeGreaterThan(statusAt);
		expect(rendered.slice(statusAt, actionsAt)).toContain('<span>Ready</span>');
		expect(rendered.slice(statusAt, actionsAt)).not.toContain('<button');
		expect(rendered.slice(actionsAt)).toContain(
			'<button class="w-full" type="button">Wide action</button>',
		);
		expect(scheduled).toContain('status={');
		expect(scheduled).not.toContain('action={');
	});

	test('renders the title as a heading at the declared semantic level', () => {
		const sectionHeader = renderCardHeader('default');
		const nestedHeader = renderCardHeader('default', false, 3);

		expect(sectionHeader).toContain(
			'<h2 class="min-w-0 text-base font-semibold text-foreground"',
		);
		expect(sectionHeader).toContain('>Card identity</h2>');
		expect(nestedHeader).toContain(
			'<h3 class="min-w-0 text-base font-semibold text-foreground"',
		);
		expect(nestedHeader).toContain('>Card identity</h3>');
	});

	test('retains the existing default CardHeader composition as the control case', async () => {
		const [card, applicability, editor] = await Promise.all([
			read('components', 'ui', 'card.tsx'),
			read(...consumers[0]),
			read('pages', 'audits', 'tabs', 'ApplicabilityMappingEditor.tsx'),
		]);

		expect(card).toContain("'flex flex-wrap items-start justify-between gap-3'");
		expect(card).not.toContain('lg:flex-nowrap');
		expect(applicability).not.toContain('actionLayout="stacked"');
		// The toggle stays in the toolbar header and the editor it opens is its own component, so
		// the control case spans two files: the tab must still reach the editor from that header,
		// and the editor must still use the default CardHeader composition.
		expect(applicability).toMatch(
			/<FilterToolbar[\s\S]*?header=[\s\S]*?Edit Global Mapping[\s\S]*?<ApplicabilityMappingEditor/,
		);
		expect(editor).not.toContain('actionLayout=');
		expect(editor).toMatch(/<CardHeader[\s\S]*?title="Global Mapping JSON"/);
	});

	test('opts in each named consumer without changing its action labels or tones', async () => {
		const [applicability, projectAudits, diary, settings] = await Promise.all([
			read(...consumers[0]),
			read(...consumers[1]),
			read(...consumers[2]),
			read(...consumers[3]),
		]);

		expect(projectAudits).not.toContain('actionLayout="stacked"');
		expect(projectAudits).toContain('<FilterToolbar');
		expect(projectAudits).toContain('actions={');
		expect(projectAudits).toContain('header={');
		expect(settings.match(/actionLayout="stacked"/g)).toHaveLength(1);

		expect(applicability).not.toContain('actionLayout="stacked"');
		expect(applicability).toContain('<MatrixLegend />');
		expect(applicability).toContain("editorOpen ? 'Cancel Edit' : 'Edit Global Mapping'");
		expect(projectAudits).toContain('Run Selected');
		expect(projectAudits).toContain('Review Selected');
		expect(projectAudits).toContain('id="project-audits-run-help"');
		expect(diary).toContain("'Write today’s entry'");
		expect(diary).toContain('filterAction={');
		expect(diary).not.toContain('actionLayout="stacked"');
		expect(settings).toContain('Restart');
		expect(settings).toContain('Shutdown');
		expect(settings).toContain('className={dangerRowActionClass}');
		expect(settings).toContain('variant="secondary"');
	});
});
