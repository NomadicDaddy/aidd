import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';

const frontendRoot = join(process.cwd(), 'frontend', 'src');

function read(path: string): Promise<string> {
	return Bun.file(join(frontendRoot, ...path.split('/'))).text();
}

describe('shared dialog layer motion, shape, scrolling and focus', () => {
	test('keeps enter and exit presence in the shared primitive with reduced-motion suppression', async () => {
		const dialog = await read('components/ui/dialog.tsx');

		expect(dialog).toContain('const DIALOG_MOTION_MS = 150;');
		expect(dialog).toContain("useState<DialogMotionState>('closed')");
		expect(dialog).toContain("setMotionState('open')");
		expect(dialog).toContain("setMotionState('closed')");
		expect(dialog).toContain("window.matchMedia('(prefers-reduced-motion: reduce)').matches");
		expect(dialog.match(/motion-reduce:transition-none/g)?.length).toBe(2);
		expect(dialog).toContain('data-state={motionState}');
	});

	test('owns container radius and viewport overflow in the dialog layer', async () => {
		const dialog = await read('components/ui/dialog.tsx');
		const panelClasses = dialog.match(/const PANEL_BASE =\s*'([^']+)'/)?.[1] ?? '';

		expect(panelClasses.split(/\s+/)).toEqual(
			expect.arrayContaining(['max-h-[calc(100dvh-3rem)]', 'overflow-y-auto', 'rounded-xl']),
		);
		expect(panelClasses).not.toContain('rounded-lg');
		expect(dialog).toContain("'min-h-0 flex-1 overflow-y-auto overscroll-contain'");
		expect(dialog).toContain('export function DialogFooter');
	});

	test('pins the long feature header while its body owns scrolling', async () => {
		const featureDetails = await read('pages/projects/detail/FeatureDetailsDialog.tsx');

		expect(featureDetails).toContain('Dialog, DialogBody, DialogPanel');
		expect(featureDetails).toContain(
			'<DialogPanel className="flex w-full max-w-4xl flex-col overflow-hidden xl:max-w-6xl">',
		);
		expect(featureDetails).toContain('<DialogBody className="px-5 pb-5">');
	});

	test('focuses the report and directive composers instead of their close controls', async () => {
		const [report, directive] = await Promise.all([
			read('components/layout/ProjectReportDialog.tsx'),
			read('components/shared/DirectiveLaunchModal.tsx'),
		]);

		expect(report).toContain('initialFocusRef={descriptionRef}');
		expect(report).toContain('ref={descriptionRef}');
		expect(directive).toContain('initialFocusRef={promptRef}');
		expect(directive).toContain('ref={promptRef}');
	});

	test('keeps commit actions last in dedicated footers with secondary dismiss actions', async () => {
		const [report, directive, skillImport] = await Promise.all([
			read('components/layout/ProjectReportDialog.tsx'),
			read('components/shared/DirectiveLaunchModal.tsx'),
			read('pages/skills/SkillImportDialog.tsx'),
		]);

		for (const source of [report, directive, skillImport]) {
			expect(source).toContain('<DialogFooter');
			expect(source.lastIndexOf('variant="secondary"')).toBeGreaterThan(
				source.indexOf('<DialogFooter'),
			);
		}
		expect(report.lastIndexOf('type="submit"')).toBeGreaterThan(
			report.lastIndexOf('variant="secondary"'),
		);
		expect(directive.lastIndexOf('type="submit"')).toBeGreaterThan(
			directive.lastIndexOf('variant="secondary"'),
		);
		expect(skillImport.indexOf('onClick={applyImport}')).toBeGreaterThan(
			skillImport.lastIndexOf('variant="secondary"'),
		);
	});

	test('lets the command palette inherit neutral shared elevation', async () => {
		const palette = await read('components/shared/CommandPalette.tsx');

		expect(palette).toContain('<DialogPanel className="w-full max-w-2xl overflow-hidden p-0">');
		expect(palette).not.toMatch(/shadow-accent|ring-ring\/15/);
	});
});
