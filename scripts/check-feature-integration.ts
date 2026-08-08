#!/usr/bin/env bun
/**
 * check-feature-integration.ts
 *
 * Enforces: QUAL-004 -- runtime modules keep their ownership boundaries, which includes a route
 * plugin or page that exists but is registered nowhere and therefore belongs to no module at all.
 *
 * Fails the build when:
 *   1 - A backend route plugin exported from backend/src/routes/*.ts is not
 *       referenced (.use(createXxxRoutes(...))) in backend/src/server.ts.
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

const ROOT = resolve(import.meta.dir, '..');
const ROUTES_DIR = resolve(ROOT, 'backend/src/routes');
const SERVER_FILE = resolve(ROOT, 'backend/src/server.ts');
const PAGES_DIR = resolve(ROOT, 'frontend/src/pages');
const APP_FILE = resolve(ROOT, 'frontend/src/App.tsx');

const PAGE_INTEGRATION_EXEMPTIONS = new Set<string>([]);

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

function extractRouteFactoryExports(source: string): string[] {
	const names: string[] = [];
	for (const match of source.matchAll(
		/export\s+function\s+(create[A-Z][A-Za-z0-9_]*Routes)\b/g,
	)) {
		names.push(match[1]!);
	}
	return names;
}

function extractServerUseCalls(source: string): Set<string> {
	const names = new Set<string>();
	for (const match of source.matchAll(/\.use\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\(/g)) {
		names.add(match[1]!);
	}
	return names;
}

function relFromRoot(absPath: string): string {
	return absPath.replace(`${ROOT}\\`, '').replace(`${ROOT}/`, '').replace(/\\/g, '/');
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

function checkBackendRoutes(): HalfScan {
	const errors: string[] = [];

	let serverSource: string;
	try {
		serverSource = readText(SERVER_FILE);
	} catch {
		errors.push(`  Cannot read backend/src/server.ts; backend route check skipped.`);
		return { errors, examined: 0 };
	}

	const registered = extractServerUseCalls(serverSource);

	let routeFiles: string[];
	try {
		routeFiles = listRouteFiles(ROUTES_DIR);
	} catch {
		errors.push(`  Cannot read backend/src/routes/; backend route check skipped.`);
		return { errors, examined: 0 };
	}

	for (const routeFile of routeFiles) {
		const source = readFileSync(routeFile, 'utf8');
		const factories = extractRouteFactoryExports(source);
		for (const factory of factories) {
			if (!registered.has(factory)) {
				errors.push(
					`  Route factory "${factory}" exported from ${relFromRoot(routeFile)} ` +
						`but not invoked via .use() in backend/src/server.ts`,
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

function checkFrontendPages(): HalfScan {
	const errors: string[] = [];

	let appSource: string;
	try {
		appSource = readText(APP_FILE);
	} catch {
		errors.push(`  Cannot read frontend/src/App.tsx; frontend page check skipped.`);
		return { errors, examined: 0 };
	}

	const imported = extractAppPageImports(appSource);

	let pageFiles: string[];
	try {
		pageFiles = listPageFiles(PAGES_DIR);
	} catch {
		errors.push(`  Cannot read frontend/src/pages/; frontend page check skipped.`);
		return { errors, examined: 0 };
	}

	for (const pageFile of pageFiles) {
		const baseName = pageFile
			.split(/[\\/]/)
			.pop()!
			.replace(/\.tsx$/, '');
		const rel = relFromRoot(pageFile);
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

export function runFeatureIntegration(): number {
	const allErrors: string[] = [];

	const backend = checkBackendRoutes();
	if (backend.errors.length > 0) {
		allErrors.push('Backend route registration mismatches:', ...backend.errors);
	}

	const frontend = checkFrontendPages();
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
