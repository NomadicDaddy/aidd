import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';

const frontendRoot = join(process.cwd(), 'frontend', 'src');

function read(...segments: string[]): Promise<string> {
	return Bun.file(join(frontendRoot, ...segments)).text();
}

function stripComments(source: string): string {
	return source.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/\/\/.*$/gmu, '');
}

describe('shared label role consumers', () => {
	test('leaves no inline uppercase micro-label or caption recipe in a component', async () => {
		const glob = new Bun.Glob('**/*.tsx');
		const offenders: string[] = [];

		for await (const file of glob.scan({ cwd: frontendRoot, onlyFiles: true })) {
			const source = stripComments(await Bun.file(join(frontendRoot, file)).text());
			const literals = source.match(/['"][^'"\n]*uppercase[^'"\n]*['"]/gu) ?? [];

			for (const literal of literals) {
				const declaresSmallStep =
					/(?:^|\s)(?:text-2xs|text-xs|text-\[0\.[0-7]\d*rem\])(?:\s|$)/u.test(
						literal.slice(1, -1),
					);
				const declaresRoleProperties =
					/(?:font-(?:medium|semibold)|tracking-(?:wide|wider))/u.test(literal);
				if (declaresSmallStep && declaresRoleProperties) {
					offenders.push(file.replaceAll('\\', '/'));
				}
			}
		}

		expect(offenders).toEqual([]);
	});

	test('names each affected label role at its call site', async () => {
		const [auth, backendMatrix, command, occurrence, preview, recipe, telemetry] =
			await Promise.all([
				read('components', 'shared', 'AuthTokenDialog.tsx'),
				read('pages', 'settings', 'BackendDefaultsTable.tsx'),
				read('components', 'ui', 'command.tsx'),
				read('pages', 'scheduled', 'ScheduledOccurrenceChildren.tsx'),
				read('pages', 'scheduled', 'ScheduleFields.tsx'),
				read('pages', 'recipes', 'RecipeStepEditor.tsx'),
				read('pages', 'telemetry', 'TelemetryComponents.tsx'),
			]);

		expect(auth).toContain('<FieldRow');
		expect(auth).toContain('Access token');
		expect(auth).toContain('configured={token.length > 0}');
		expect(auth).toContain('context="web-store"');
		expect(backendMatrix).toContain('<thead className={tableHeadClass}>');
		expect(backendMatrix).not.toContain('fieldLabelClass');
		expect(command).toContain('commandGroupSectionCaptionClass');
		expect(occurrence).toContain('${microLabelClass} text-muted-foreground tabular-nums');
		expect(preview).toContain('text-muted-foreground ${microLabelClass}');
		expect(recipe).toContain('<legend className={cn(sectionCaptionClass');
		expect(recipe).toContain('Condition (optional)');
		expect(telemetry).toContain('gap-y-1 text-xs text-muted-foreground');
	});

	test('keeps body messages out of the micro-label step', async () => {
		const actions = await read('pages', 'scheduled', 'ScheduledFormActions.tsx');

		expect(actions).toContain('text-sm text-muted-foreground');
		expect(actions).not.toContain('className="text-2xs text-muted-foreground"');
	});
});
