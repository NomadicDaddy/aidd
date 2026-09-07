import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

const FRONTEND_SOURCE = resolve(import.meta.dir, '../../frontend/src');

/* Generated code may be exempt only by naming its source-relative path and why its generator cannot
   emit explicit properties. Authored files never belong here. There are no exemptions today. */
const GENERATED_CODE_EXEMPTIONS = new Map<string, string>();

const BROAD_TRANSITION_PATTERN =
	/\btransition-all\b|transition(?:-property)?\s*:\s*all(?:\s|;|!|$)/gu;

function lineNumberAt(source: string, index: number): number {
	return source.slice(0, index).split('\n').length;
}

describe('frontend transition property discipline', () => {
	test('rejects transition-all outside documented generated code', async () => {
		const offenders: string[] = [];

		for await (const path of new Bun.Glob('**/*.{css,ts,tsx}').scan(FRONTEND_SOURCE)) {
			const relativePath = path.replaceAll('\\', '/');
			if (GENERATED_CODE_EXEMPTIONS.has(relativePath)) continue;

			const source = await Bun.file(resolve(FRONTEND_SOURCE, path)).text();
			for (const match of source.matchAll(BROAD_TRANSITION_PATTERN)) {
				offenders.push(`${relativePath}:${lineNumberAt(source, match.index)}`);
			}
		}

		for (const [path, reason] of GENERATED_CODE_EXEMPTIONS) {
			expect(reason.trim(), `${path} needs a generated-code reason`).not.toBe('');
			expect(await Bun.file(resolve(FRONTEND_SOURCE, path)).exists(), path).toBe(true);
		}
		expect(offenders).toEqual([]);
	});

	test('lists only the state properties used by the audited controls', async () => {
		const colorAndShadow =
			'transition-[color,background-color,border-color,box-shadow] duration-150';
		const expected = new Map([
			['components/layout/SidebarNav.tsx', colorAndShadow],
			['components/ui/button.tsx', colorAndShadow],
			['pages/docs/DocsSidebar.tsx', colorAndShadow],
			[
				'pages/projects/detail/dependencyGraphEdges.tsx',
				'transition-[color,opacity] duration-150',
			],
		]);

		for (const [path, transition] of expected) {
			const source = await Bun.file(resolve(FRONTEND_SOURCE, path)).text();
			expect(source, path).toContain(transition);
		}
	});
});
