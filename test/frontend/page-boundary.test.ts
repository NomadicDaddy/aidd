import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join, posix, relative } from 'node:path';

const ROOT = join(import.meta.dir, '../..');
const PAGES = join(ROOT, 'frontend/src/pages');

interface PageImport {
	from: string;
	fromDomain: string;
	target: string;
	targetDomain: string;
}

/** Every relative import between two different page domains under frontend/src/pages. */
async function crossDomainImports(): Promise<{ imports: PageImport[]; visited: number }> {
	const imports: PageImport[] = [];
	let visited = 0;
	for (const file of new Bun.Glob('**/*.{ts,tsx}').scanSync(PAGES)) {
		visited += 1;
		const from = file.split('\\').join('/');
		const fromDomain = from.split('/')[0] ?? '';
		const source = await readFile(join(PAGES, file), 'utf8');
		for (const match of source.matchAll(/(?:from\s+|import\(\s*)'(\.[^']*)'/gu)) {
			const target = posix.normalize(posix.join(posix.dirname(from), match[1] ?? ''));
			if (target.startsWith('../')) continue;
			const targetDomain = target.split('/')[0] ?? '';
			if (targetDomain !== fromDomain)
				imports.push({ from, fromDomain, target, targetDomain });
		}
	}
	return { imports, visited };
}

function describeImports(imports: PageImport[]): string[] {
	return imports.map(
		(entry) => `${relative(ROOT, join(PAGES, entry.from))} -> pages/${entry.target}`,
	);
}

/**
 * A page directory is not a shared layer. Code two pages need lives in lib/ or components/shared,
 * so a page can change without another page's dependency graph changing with it. Each assertion
 * names the boundary its audit finding drew; the walk count is the control that files were read.
 */
describe('page domains do not import one another', () => {
	test('nothing outside pages/projects imports from it', async () => {
		const { imports, visited } = await crossDomainImports();
		expect(visited).toBeGreaterThan(100);
		expect(
			describeImports(imports.filter((entry) => entry.targetDomain === 'projects')),
		).toEqual([]);
	});

	test('no page domain imports another page domain', async () => {
		const { imports, visited } = await crossDomainImports();
		expect(visited).toBeGreaterThan(100);
		expect(describeImports(imports)).toEqual([]);
	});

	test('no other domain imports pages/runs or pages/pipelineSessions', async () => {
		const { imports, visited } = await crossDomainImports();
		expect(visited).toBeGreaterThan(100);
		expect(
			describeImports(
				imports.filter(
					(entry) =>
						entry.targetDomain === 'runs' || entry.targetDomain === 'pipelineSessions',
				),
			),
		).toEqual([]);
	});
});
