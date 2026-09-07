import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';

const frontendRoot = join(process.cwd(), 'frontend', 'src');

function read(...segments: string[]): Promise<string> {
	return Bun.file(join(frontendRoot, ...segments)).text();
}

function stripComments(source: string): string {
	return source.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/\/\/.*$/gmu, '');
}

describe('micro-label scale single source', () => {
	test('routes metric and table labels through the declared 11px step', async () => {
		const [metric, tableStyles, typography] = await Promise.all([
			read('components', 'shared', 'Metric.tsx'),
			read('lib', 'tableStyles.ts'),
			read('lib', 'typography.ts'),
		]);

		expect(typography).toContain(
			"export const microLabelClass = 'text-2xs font-medium tracking-wide uppercase'",
		);
		expect(metric).toContain("import { microLabelClass } from '../../lib/typography.ts';");
		expect(metric).toContain('microLabelClass,');
		expect(metric).not.toContain(
			'text-xs font-medium tracking-wide text-muted-foreground uppercase',
		);
		expect(tableStyles).toContain("import { microLabelClass } from './typography.ts';");
		expect(tableStyles).toContain('microLabelClass,');
		expect(tableStyles).toContain('[&_th]:[font-weight:inherit]');
		expect(tableStyles).not.toContain('bg-muted text-xs text-muted-foreground uppercase');
	});

	test('keeps table headers and detail labels from retyping the uppercase step', async () => {
		const glob = new Bun.Glob('**/*.tsx');
		const inlineTableSteps: string[] = [];
		const inlineDetailSteps: string[] = [];

		for await (const file of glob.scan({ cwd: frontendRoot, onlyFiles: true })) {
			const source = stripComments(await Bun.file(join(frontendRoot, file)).text());
			if (/<t(?:head|r)\s+className="[^"]*uppercase/u.test(source)) {
				inlineTableSteps.push(file.replaceAll('\\', '/'));
			}
			if (/<dt\s+className="[^"]*uppercase/u.test(source)) {
				inlineDetailSteps.push(file.replaceAll('\\', '/'));
			}
		}

		expect(inlineTableSteps).toEqual([]);
		expect(inlineDetailSteps).toEqual([]);
	});

	test('keeps badge face and casing inside the component contract', async () => {
		const [badge, identityBadge] = await Promise.all([
			read('components', 'ui', 'badge.tsx'),
			read('components', 'shared', 'ExecutionIdentityBadges.tsx'),
		]);
		const classContract = badge.slice(
			badge.indexOf('className={cn('),
			badge.indexOf('ref={ref}'),
		);

		expect(badge).toContain("casing?: 'preserve' | 'title';");
		expect(badge).toContain("casing = 'preserve'");
		expect(classContract).toContain("'font-sans tracking-normal'");
		expect(classContract).toContain("casing === 'title' ? 'capitalize' : 'normal-case'");
		expect(classContract.indexOf("'font-sans tracking-normal'")).toBeGreaterThan(
			classContract.indexOf('className,'),
		);
		expect(identityBadge).toContain('casing="preserve"');
	});

	test('returns the maturity caption to a named type step', async () => {
		const ring = stripComments(await read('components', 'shared', 'MaturityRing.tsx'));

		expect(ring).toContain('text-2xs font-medium text-muted-foreground');
		expect(ring).not.toContain('text-[10px]');
	});
});
