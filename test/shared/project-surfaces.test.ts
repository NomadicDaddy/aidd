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

	// Moving real source deeper must not be able to remove an audit, so there is no depth limit.
	test('the scan reads as deep as the source goes', async () => {
		expect(await surfaces({ 'a/b/c/d/e/f/g/page.html': '' })).toEqual({
			'web-frontend': 'page.html under a/b/c/d/e/f/g/',
		});
	});

	// Only a scan that finished can say a surface is absent.
	test('a project that cannot be read at all has nothing ruled out', async () => {
		const missing = join(await project({}), 'not-there');
		const unread = 'file scan incomplete: the project root could not be read';
		expect(
			Object.fromEntries((await readProjectAuditEvidence(missing, mapping)).surfaces),
		).toEqual({ database: unread, 'web-frontend': unread });
	});

	// A scan that ran out has ruled nothing out. Reading that as "absent" withholds an audit on an
	// unfinished search, so each surface still being looked for counts as present and says why.
	test('a scan that spends its budget counts what it was still looking for as present', async () => {
		const dir = await project({ 'wide/site/index.html': '<!doctype html>' });
		for (let index = 0; index < 5000; index++) {
			await writeFile(join(dir, 'wide', `note-${index}.txt`), '');
		}
		// `wide/` alone spends the budget, so `wide/site/` is never read.
		const stopped = 'file scan incomplete: it stopped at its limit of 5000 entries';
		expect(Object.fromEntries((await readProjectAuditEvidence(dir, mapping)).surfaces)).toEqual(
			{ database: stopped, 'web-frontend': stopped },
		);
	});

	test('a surface found before the budget ran out keeps its own evidence', async () => {
		const dir = await project({ 'index.html': '<!doctype html>' });
		for (let index = 0; index < 5000; index++) {
			await writeFile(join(dir, `note-${index}.txt`), '');
		}
		expect(Object.fromEntries((await readProjectAuditEvidence(dir, mapping)).surfaces)).toEqual(
			{
				database: 'file scan incomplete: it stopped at its limit of 5000 entries',
				'web-frontend': 'index.html at the project root',
			},
		);
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

	test('a migrations directory with no SQL in it does not count', async () => {
		expect(await surfaces({ 'src/migrations/0001_init.ts': '' })).toEqual({});
	});

	// A project can keep its database with no driver package and its SQL nowhere near a
	// directory named for migrations: a database file under data/ and an init script under api/.
	test('a database file or a SQL script counts wherever the scan reaches', async () => {
		expect(await surfaces({ 'data/app.db': '' })).toEqual({
			database: 'app.db under data/',
		});
		expect(await surfaces({ 'data/app.sqlite3': '' })).toEqual({
			database: 'app.sqlite3 under data/',
		});
		expect(await surfaces({ 'api/debug/init.sql': '' })).toEqual({
			database: 'init.sql under api/debug/',
		});
	});

	test("Windows' thumbnail cache is not a database", async () => {
		expect(await surfaces({ 'assets/Thumbs.db': '' })).toEqual({});
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
