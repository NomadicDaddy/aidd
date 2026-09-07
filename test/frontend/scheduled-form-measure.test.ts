import { expect, test } from 'bun:test';

import { readFile } from 'node:fs/promises';

const source = (path: string) => readFile(path, 'utf8');

test('Scheduled forms inherit the page rail and keep an exit beside the commit action', async () => {
	const [actions, form, measure, page, scopeSafety, section] = await Promise.all([
		source('frontend/src/pages/scheduled/ScheduledFormActions.tsx'),
		source('frontend/src/pages/scheduled/ScheduledTaskForm.tsx'),
		source('frontend/src/pages/scheduled/scheduledFormMeasure.ts'),
		source('frontend/src/pages/scheduled/ScheduledPage.tsx'),
		source('frontend/src/pages/scheduled/ScheduledScopeSafetySections.tsx'),
		source('frontend/src/pages/scheduled/ScheduledFormSection.tsx'),
	]);

	expect(page).toContain('const PAGE_RAIL = pageRailByContentType.catalog;');
	expect(page).toContain('<PageRail className="page-reveal space-y-5" rail={PAGE_RAIL}>');
	expect(page).toContain('rail={PAGE_RAIL}');
	expect(form).toContain('<Card className="space-y-3" variant="panel">');
	expect(form).not.toContain('scheduledFormCardMeasureClass');
	expect(measure).not.toContain('scheduledFormCardMeasureClass');
	expect(measure).not.toContain('scheduledFormRowMeasureClass');
	expect(section).toContain('className="space-y-3 border-t border-border pt-4"');
	expect(scopeSafety).toContain('<div className="space-y-4">');
	expect(actions).toContain(
		'className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border pt-4"',
	);
	expect(measure).not.toContain('scheduledFormSingleColumnMeasureClass');
	expect(form).toContain(
		'className={`grid gap-3 sm:grid-cols-2 ${scheduledFormTwoColumnMeasureClass}`}',
	);
	expect(actions).toContain('Cancel');
	expect(actions).toContain('onCancel');
	expect(form).not.toContain('<ScheduledFormSection title="Actions">');
});
