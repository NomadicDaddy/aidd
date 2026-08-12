import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';

const frontendSource = join(process.cwd(), 'frontend', 'src');

function read(...segments: string[]): Promise<string> {
	return Bun.file(join(frontendSource, ...segments)).text();
}

const consumers = [
	['pages', 'audits', 'tabs', 'ApplicabilityTab.tsx'],
	['pages', 'projects', 'detail', 'AuditsTab.tsx'],
	['pages', 'projects', 'detail', 'DiaryTab.tsx'],
	['pages', 'settings', 'SettingsRuntimeControls.tsx'],
] as const;

describe('container-aware CardHeader actions', () => {
	test('stacks only opted-in action headers until their content clears 32rem', async () => {
		const card = await read('components', 'ui', 'card.tsx');

		expect(card).toContain("type CardHeaderActionLayout = 'default' | 'stacked';");
		expect(card).toContain("actionLayout = 'default'");
		expect(card).toContain("action !== undefined && actionLayout === 'stacked'");
		expect(card).toContain("? '@container'");
		expect(card).toContain(
			'flex flex-col items-stretch justify-between gap-3 @min-[32rem]:flex-row @min-[32rem]:items-start',
		);
	});

	test('retains the existing default CardHeader composition as the control case', async () => {
		const card = await read('components', 'ui', 'card.tsx');
		const applicability = await read(...consumers[0]);

		expect(card).toContain("'flex flex-wrap items-start justify-between gap-3 lg:flex-nowrap'");
		expect(applicability.match(/actionLayout="stacked"/g)).toHaveLength(1);
		expect(applicability).toMatch(
			/<CardHeader[\s\S]*?Edit Global Mapping[\s\S]*?actionLayout="stacked"[\s\S]*?<CardHeader[\s\S]*?title="Global Mapping JSON"/,
		);
	});

	test('opts in each named consumer without changing its action labels or tones', async () => {
		const [applicability, projectAudits, diary, settings] = await Promise.all([
			read(...consumers[0]),
			read(...consumers[1]),
			read(...consumers[2]),
			read(...consumers[3]),
		]);

		for (const source of [applicability, projectAudits, diary, settings]) {
			expect(source.match(/actionLayout="stacked"/g)).toHaveLength(1);
		}

		expect(applicability).toContain("editorOpen ? 'Cancel Edit' : 'Edit Global Mapping'");
		expect(projectAudits).toContain('Run Selected');
		expect(projectAudits).toContain('Review Selected');
		expect(projectAudits).toContain('id="project-audits-run-help"');
		expect(diary).toContain("'Write today’s entry'");
		expect(settings).toContain('Restart');
		expect(settings).toContain('Shutdown');
		expect(settings).toContain('variant="danger"');
	});
});
