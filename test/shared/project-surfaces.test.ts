import { afterEach, describe, expect, test } from 'bun:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { normalizeAuditProfileMapping } from '../../shared/src/contracts/audit-profile-mapping.ts';
import { removeTempTree } from '../../shared/src/lib/remove-temp-tree.ts';
import { readProjectAuditEvidence } from '../../shared/src/metadata/project-surfaces.ts';
import { testTempDir } from '../_helpers/temp.ts';

const roots: string[] = [];

const mapping = normalizeAuditProfileMapping({
	rules: [],
	surfaces: {
		database: { packages: ['drizzle-orm', 'pg'] },
		'web-frontend': { packages: ['react', 'vite'] },
	},
	version: 1,
});

async function project(files: Record<string, string>): Promise<string> {
	const root = await testTempDir('aidd-project-surfaces-');
	roots.push(root);
	for (const [path, content] of Object.entries(files)) {
		const full = join(root, path);
		await mkdir(dirname(full), { recursive: true });
		await writeFile(full, content);
	}
	return root;
}

async function surfaces(files: Record<string, string>): Promise<Record<string, string>> {
	const evidence = await readProjectAuditEvidence(await project(files), mapping);
	return Object.fromEntries(evidence.surfaces);
}

function manifest(dependencies: Record<string, string>): string {
	return JSON.stringify({ dependencies });
}

afterEach(async () => {
	for (const root of roots.splice(0)) await removeTempTree(root);
});

describe('surface detection from declared packages', () => {
	test('a declared package settles a surface and names the manifest that declares it', async () => {
		expect(
			await surfaces({
				'backend/package.json': manifest({ pg: '8.0.0' }),
				'frontend/package.json': manifest({ react: '19.0.0' }),
				'package.json': manifest({ typescript: '6.0.3' }),
			}),
		).toEqual({
			database: 'declares pg in backend/package.json',
			'web-frontend': 'declares react in frontend/package.json',
		});
	});

	test('a package the catalogue does not list is not evidence', async () => {
		expect(
			await surfaces({
				'package.json': manifest({ elysia: '1.0.0', typescript: '6.0.3' }),
				'src/cli.ts': 'export const run = 1;\n',
			}),
		).toEqual({});
	});

	test('a manifest under node_modules is not the project declaring anything', async () => {
		expect(
			await surfaces({
				'node_modules/dep/package.json': manifest({ pg: '8.0.0', react: '19.0.0' }),
				'package.json': manifest({ typescript: '6.0.3' }),
			}),
		).toEqual({});
	});

	test('a surface the catalogue does not define is not looked for', async () => {
		const dir = await project({ 'index.html': '<!doctype html>', 'package.json': '{}' });
		const bare = normalizeAuditProfileMapping({ rules: [], version: 1 });
		expect((await readProjectAuditEvidence(dir, bare)).surfaces.size).toBe(0);
	});
});

describe('web-frontend detection from markup source', () => {
	test('a static page counts, at the root or under a source directory', async () => {
		expect(await surfaces({ 'index.html': '<!doctype html>' })).toEqual({
			'web-frontend': 'index.html at the project root',
		});
		expect(await surfaces({ 'public/index.html': '<!doctype html>' })).toEqual({
			'web-frontend': 'index.html under public/',
		});
	});

	test('every markup extension counts', async () => {
		for (const file of ['Page.astro', 'App.vue', 'App.svelte', 'App.tsx', 'App.jsx']) {
			expect(await surfaces({ [`src/ui/${file}`]: '' })).toEqual({
				'web-frontend': `${file} under src/ui/`,
			});
		}
	});

	test('plain TypeScript, styles and data are not markup', async () => {
		expect(
			await surfaces({
				'README.md': '# fixture-cli\n',
				'src/cli.ts': '',
				'src/data.json': '{}',
				'src/theme.css': '',
			}),
		).toEqual({});
	});

	test('markup in a directory that is not shipped source does not count', async () => {
		const excluded = [
			'.aidd',
			'.cache',
			'.git',
			'__tests__',
			'build',
			'config',
			'coverage',
			'dist',
			'docs',
			'examples',
			'fixtures',
			'node_modules/dep',
			'out',
			'scripts',
			'src/__tests__',
			'src/fixtures',
			'test',
			'tests',
		];
		for (const dir of excluded) {
			expect(await surfaces({ [`${dir}/index.html`]: '<!doctype html>' })).toEqual({});
		}
	});

	test('the scan reads four directories down and no further', async () => {
		expect(await surfaces({ 'a/b/c/d/page.html': '' })).toEqual({
			'web-frontend': 'page.html under a/b/c/d/',
		});
		expect(await surfaces({ 'a/b/c/d/e/page.html': '' })).toEqual({});
	});

	test('the scan gives up once it has examined its budget of entries', async () => {
		const dir = await project({ 'wide/site/index.html': '<!doctype html>' });
		for (let index = 0; index < 5000; index++) {
			await writeFile(join(dir, 'wide', `note-${index}.txt`), '');
		}
		// `wide/` alone spends the budget, so `wide/site/` is never read.
		expect((await readProjectAuditEvidence(dir, mapping)).surfaces.size).toBe(0);
	});
});

describe('database detection from schema evidence', () => {
	test('SQL migrations and a Prisma schema each count', async () => {
		expect(await surfaces({ 'backend/src/db/migrations/0001_init.sql': '' })).toEqual({
			database: '0001_init.sql under backend/src/db/migrations/',
		});
		expect(await surfaces({ 'backend/drizzle/0000_first.sql': '' })).toEqual({
			database: '0000_first.sql under backend/drizzle/',
		});
		expect(await surfaces({ 'prisma/schema.prisma': '' })).toEqual({
			database: 'schema.prisma under prisma/',
		});
	});

	test('a migrations directory with no SQL, and SQL outside one, do not count', async () => {
		expect(await surfaces({ 'src/migrations/0001_init.ts': '' })).toEqual({});
		expect(await surfaces({ 'src/queries/report.sql': '' })).toEqual({});
	});

	test('opening a database with the built-in driver is not owning one', async () => {
		expect(
			await surfaces({
				'package.json': manifest({ typescript: '6.0.3' }),
				'src/reader.ts': "import { Database } from 'bun:sqlite';\n",
			}),
		).toEqual({});
	});

	test('migrations in a directory that is not shipped source do not count', async () => {
		for (const dir of ['docs', 'examples', 'node_modules/dep', 'scripts', 'tests', '.data']) {
			expect(await surfaces({ [`${dir}/migrations/0001_init.sql`]: '' })).toEqual({});
		}
	});

	test('both surfaces are found in one scan', async () => {
		expect(
			await surfaces({
				'db/migrations/0001_init.sql': '',
				'web/index.html': '<!doctype html>',
			}),
		).toEqual({
			database: '0001_init.sql under db/migrations/',
			'web-frontend': 'index.html under web/',
		});
	});
});
