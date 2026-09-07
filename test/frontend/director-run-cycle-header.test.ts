import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

const directorPagePath = resolve(
	import.meta.dir,
	'../../frontend/src/pages/director/DirectorPage.tsx',
);

async function readRunCycleSection(): Promise<string> {
	const source = await Bun.file(directorPagePath).text();
	const sectionStart = source.indexOf('<section aria-labelledby="director-cycle-heading">');
	const sectionEnd = source.indexOf('</section>', sectionStart);

	expect(sectionStart).toBeGreaterThan(-1);
	expect(sectionEnd).toBeGreaterThan(sectionStart);
	return source.slice(sectionStart, sectionEnd);
}

describe('the Director Run Cycle header responds to its card width', () => {
	test('uses the shared container-aware action layout', async () => {
		const runCycleSection = await readRunCycleSection();

		expect(runCycleSection).toContain('<Card className="@container">');
		expect(runCycleSection).toContain('actionLayout="stacked"');
		expect(runCycleSection).not.toContain('@min-[46rem]:flex-row');
		expect(runCycleSection).not.toContain('lg:flex-row');
	});

	test('keeps the launch target ahead of the inline shared composer', async () => {
		const runCycleSection = await readRunCycleSection();

		expect(runCycleSection.indexOf('<LaunchTargetBadge')).toBeGreaterThan(-1);
		expect(runCycleSection.indexOf('<DirectorComposer')).toBeGreaterThan(
			runCycleSection.indexOf('<LaunchTargetBadge'),
		);
		expect(runCycleSection).toContain('onSubmit={triggerCycle}');
		expect(runCycleSection).toContain('placement="inline"');
	});
});
