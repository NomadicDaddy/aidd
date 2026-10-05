#!/usr/bin/env bun
/**
 * check-feature-integration.ts
 *
 * Enforces: QUAL-004 -- runtime modules keep their ownership boundaries, which includes a route
 * plugin or page that exists but is registered nowhere and therefore belongs to no module at all.
 *
 * Fails the build when:
 *   1 - A backend route factory exported from backend/src/routes/*.ts (create*Routes, or a
 *       *RouteGroup mounted inside another route plugin) is not reached by a .use() chain from
 *       backend/src/server.ts: used there directly, or inside a route file whose own factory is.
 *   2 - A page component under frontend/src/pages/ matching *Page.tsx is not
 *       imported in frontend/src/App.tsx (or listed in PAGE_INTEGRATION_EXEMPTIONS).
 *
 * aidd does not follow the Spernakit `create-api-app.ts` / `routes/lazyPages.ts`
 * convention. Backend routes register through `backend/src/server.ts` and frontend
 * pages route through `frontend/src/App.tsx`. The Spernakit baseline check in the
 * audit framework therefore cannot run here; this script is the aidd equivalent.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cwd, exit } from 'node:process';

const REPO_ROOT = resolve(import.meta.dir, '..');

const PAGE_INTEGRATION_EXEMPTIONS = new Set<string>([]);

interface IntegrationPaths {
	appFile: string;
	pagesDir: string;
	root: string;
	routesDir: string;
	serverFile: string;
}

function integrationPaths(root: string): IntegrationPaths {
	return {
		appFile: resolve(root, 'frontend/src/App.tsx'),
		pagesDir: resolve(root, 'frontend/src/pages'),
		root,
		routesDir: resolve(root, 'backend/src/routes'),
		serverFile: resolve(root, 'backend/src/server.ts'),
	};
}

function readText(absPath: string): string {
	return readFileSync(absPath, 'utf8');
}

function listRouteFiles(dir: string): string[] {
	const results: string[] = [];
	const entries = readdirSync(dir, { withFileTypes: true });
	for (const entry of entries) {
		if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
			results.push(resolve(dir, entry.name));
		}
	}
	return results;
}

function listPageFiles(dir: string): string[] {
	const results: string[] = [];
	function walk(current: string): void {
		const entries = readdirSync(current, { withFileTypes: true });
		for (const entry of entries) {
			const full = resolve(current, entry.name);
			if (entry.isDirectory()) {
				walk(full);
			} else if (entry.isFile() && entry.name.endsWith('Page.tsx')) {
				results.push(full);
			}
		}
	}
	walk(dir);
	return results;
}

// Top-level plugins are create*Routes; a *RouteGroup is a plugin another route file mounts. Only
// matching create*Routes left the groups invisible, so deleting their mount removed endpoints
// while this check stayed green.
function extractRouteFactoryExports(source: string): string[] {
	const names: string[] = [];
	for (const match of source.matchAll(
		/export\s+function\s+([a-z][A-Za-z0-9_]*(?:Routes|RouteGroup))\b/g,
	)) {
		names.push(match[1]!);
	}
	return names;
}

function extractUseCalls(source: string): Set<string> {
	const names = new Set<string>();
	for (const match of source.matchAll(/\.use\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\(/g)) {
		names.add(match[1]!);
	}
	return names;
}

function relFromRoot(root: string, absPath: string): string {
	return absPath.replace(`${root}\\`, '').replace(`${root}/`, '').replace(/\\/g, '/');
}

// Reached means used by server.ts, or by a route file one of whose own factories is reached, so a
// group mounted by an unregistered plugin is not counted as registered.
function reachableFactories(
	serverUses: Set<string>,
	routeFiles: { factories: string[]; uses: Set<string> }[],
): Set<string> {
	const reached = new Set(serverUses);
	let grew = true;
	while (grew) {
		grew = false;
		for (const file of routeFiles) {
			if (!file.factories.some((factory) => reached.has(factory))) continue;
			for (const name of file.uses) {
				if (reached.has(name)) continue;
				reached.add(name);
				grew = true;
			}
		}
	}
	return reached;
}

interface HalfScan {
	errors: string[];
	/**
	 * Files this half actually opened. Rule 5's count.
	 *
	 * Both halves swallow their own directory-read failure into an error string, and both walk a
	 * directory whose contents are discovered rather than named here. A rename that emptied either
	 * directory would produce zero findings, which is the same result a fully-registered tree
	 * produces. Only the count separates them.
	 */
	examined: number;
}

function checkBackendRoutes(paths: IntegrationPaths): HalfScan {
	const errors: string[] = [];

	let serverSource: string;
	try {
		serverSource = readText(paths.serverFile);
	} catch {
		errors.push(`  Cannot read backend/src/server.ts; backend route check skipped.`);
		return { errors, examined: 0 };
	}

	let routeFiles: string[];
	try {
		routeFiles = listRouteFiles(paths.routesDir);
	} catch {
		errors.push(`  Cannot read backend/src/routes/; backend route check skipped.`);
		return { errors, examined: 0 };
	}

	const scanned = routeFiles.map((routeFile) => {
		const source = readFileSync(routeFile, 'utf8');
		return {
			factories: extractRouteFactoryExports(source),
			path: routeFile,
			uses: extractUseCalls(source),
		};
	});
	const reached = reachableFactories(extractUseCalls(serverSource), scanned);
	for (const file of scanned) {
		for (const factory of file.factories) {
			if (!reached.has(factory)) {
				errors.push(
					`  Route factory "${factory}" exported from ${relFromRoot(paths.root, file.path)} ` +
						`is not reached by a .use() chain from backend/src/server.ts`,
				);
			}
		}
	}

	return { errors, examined: routeFiles.length };
}

function extractAppPageImports(source: string): Set<string> {
	const components = new Set<string>();
	for (const match of source.matchAll(/import\(\s*['"][^'"]*\/(\w+Page)\.tsx?['"]\s*\)/g)) {
		components.add(match[1]!);
	}
	for (const match of source.matchAll(
		/import\s*\{([^}]+)\}\s*from\s*['"][^'"]*\/\w+Page\.tsx?['"]/g,
	)) {
		const names = match[1]!.split(',').map((s) =>
			s
				.trim()
				.split(/\s+as\s+/)[0]!
				.trim(),
		);
		for (const name of names) {
			if (name.endsWith('Page')) components.add(name);
		}
	}
	return components;
}

function checkFrontendPages(paths: IntegrationPaths): HalfScan {
	const errors: string[] = [];

	let appSource: string;
	try {
		appSource = readText(paths.appFile);
	} catch {
		errors.push(`  Cannot read frontend/src/App.tsx; frontend page check skipped.`);
		return { errors, examined: 0 };
	}

	const imported = extractAppPageImports(appSource);

	let pageFiles: string[];
	try {
		pageFiles = listPageFiles(paths.pagesDir);
	} catch {
		errors.push(`  Cannot read frontend/src/pages/; frontend page check skipped.`);
		return { errors, examined: 0 };
	}

	for (const pageFile of pageFiles) {
		const baseName = pageFile
			.split(/[\\/]/)
			.pop()!
			.replace(/\.tsx$/, '');
		const rel = relFromRoot(paths.root, pageFile);
		if (PAGE_INTEGRATION_EXEMPTIONS.has(rel)) continue;
		if (!imported.has(baseName)) {
			errors.push(
				`  Page "${baseName}" exists at ${rel} ` +
					`but is not imported in frontend/src/App.tsx`,
			);
		}
	}

	return { errors, examined: pageFiles.length };
}

/** `root` is the repository to check; tests point it at a fixture tree. */
export function runFeatureIntegration(root: string = REPO_ROOT): number {
	const paths = integrationPaths(root);
	const allErrors: string[] = [];

	const backend = checkBackendRoutes(paths);
	if (backend.errors.length > 0) {
		allErrors.push('Backend route registration mismatches:', ...backend.errors);
	}

	const frontend = checkFrontendPages(paths);
	if (frontend.errors.length > 0) {
		allErrors.push('Frontend page registration mismatches:', ...frontend.errors);
	}

	if (allErrors.length > 0) {
		console.error('[FAIL] Feature integration check found issues:');
		for (const line of allErrors) {
			console.error(line);
		}
		return 1;
	}

	// Rule 5. Both halves assert an absence -- no unregistered route, no unimported page -- over a
	// directory they discover at run time. A move that emptied either one returns no findings, and
	// without the counts that is indistinguishable from a tree where everything is wired up.
	if (backend.examined === 0 || frontend.examined === 0) {
		console.error('[FAIL] Feature integration check examined nothing on one or both halves.');
		console.error(
			`  backend/src/routes/: ${backend.examined} file(s); ` +
				`frontend/src/pages/: ${frontend.examined} file(s).`,
		);
		return 1;
	}

	console.log(
		`[OK] Feature integration check passed (${backend.examined} route file(s) and ` +
			`${frontend.examined} page file(s) examined).`,
	);
	return 0;
}

if (import.meta.main) {
	void cwd();
	exit(runFeatureIntegration());
}
