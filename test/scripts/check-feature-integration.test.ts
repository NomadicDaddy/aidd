import { afterEach, expect, test } from 'bun:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { runFeatureIntegration } from '../../scripts/check-feature-integration.ts';
import { testTempDir } from '../_helpers/temp.ts';
import { removeTempTree } from '../backend/_helpers/remove-temp-tree.ts';

// A route group is a plugin another route file mounts (projectRepositoryRouteGroup inside the
// projects routes). The check used to see only create*Routes exported functions, so deleting a
// group's mount removed its endpoints while the gate stayed green.

const roots: string[] = [];

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => removeTempTree(root)));
});

async function fixture(files: Record<string, string>): Promise<string> {
	const root = await testTempDir('aidd-feature-integration-');
	roots.push(root);
	const all: Record<string, string> = {
		'frontend/src/App.tsx': "const Home = lazy(() => import('./pages/HomePage.tsx'));\n",
		'frontend/src/pages/HomePage.tsx': 'export function HomePage() {}\n',
		...files,
	};
	for (const [path, content] of Object.entries(all)) {
		await mkdir(dirname(join(root, path)), { recursive: true });
		await writeFile(join(root, path), content);
	}
	return root;
}

const server = 'app.use(createProjectsRoutes(context));\n';
const repositoryGroup = 'export function projectRepositoryRouteGroup(context, prefix) {}\n';

test('a route group whose mount was removed fails the check', async () => {
	const root = await fixture({
		'backend/src/routes/projectRepository.ts': repositoryGroup,
		'backend/src/routes/projects.ts': 'export function createProjectsRoutes(context) {}\n',
		'backend/src/server.ts': server,
	});
	expect(runFeatureIntegration(root)).toBe(1);
});

test('a route group mounted by a registered plugin passes', async () => {
	const root = await fixture({
		'backend/src/routes/projectRepository.ts': repositoryGroup,
		'backend/src/routes/projects.ts':
			'export function createProjectsRoutes(context) {\n' +
			"\treturn new Elysia().use(projectRepositoryRouteGroup(context, ''));\n}\n",
		'backend/src/server.ts': server,
	});
	expect(runFeatureIntegration(root)).toBe(0);
});

test('a route group mounted only by an unregistered plugin fails with it', async () => {
	const root = await fixture({
		'backend/src/routes/legacy.ts':
			'export function createLegacyRoutes(context) {\n' +
			"\treturn new Elysia().use(projectRepositoryRouteGroup(context, ''));\n}\n",
		'backend/src/routes/projectRepository.ts': repositoryGroup,
		'backend/src/routes/projects.ts': 'export function createProjectsRoutes(context) {}\n',
		'backend/src/server.ts': server,
	});
	expect(runFeatureIntegration(root)).toBe(1);
});
