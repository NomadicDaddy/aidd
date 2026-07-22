#!/usr/bin/env bun
/**
 * check-feature-integration.ts
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
import { readFileSync, readdirSync } from 'node:fs';
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
		/export\s+function\s+(create[A-Z][A-Za-z0-9_]*Routes)\b/g
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

function checkBackendRoutes(): string[] {
	const errors: string[] = [];

	let serverSource: string;
	try {
		serverSource = readText(SERVER_FILE);
	} catch {
		errors.push(`  Cannot read backend/src/server.ts; backend route check skipped.`);
		return errors;
	}

	const registered = extractServerUseCalls(serverSource);

	let routeFiles: string[];
	try {
		routeFiles = listRouteFiles(ROUTES_DIR);
	} catch {
		errors.push(`  Cannot read backend/src/routes/; backend route check skipped.`);
		return errors;
	}

	for (const routeFile of routeFiles) {
		const source = readFileSync(routeFile, 'utf8');
		const factories = extractRouteFactoryExports(source);
		for (const factory of factories) {
			if (!registered.has(factory)) {
				errors.push(
					`  Route factory "${factory}" exported from ${relFromRoot(routeFile)} ` +
						`but not invoked via .use() in backend/src/server.ts`
				);
			}
		}
	}

	return errors;
}

function extractAppPageImports(source: string): Set<string> {
	const components = new Set<string>();
	for (const match of source.matchAll(/import\(\s*['"][^'"]*\/(\w+Page)\.tsx?['"]\s*\)/g)) {
		components.add(match[1]!);
	}
	for (const match of source.matchAll(
		/import\s*\{([^}]+)\}\s*from\s*['"][^'"]*\/\w+Page\.tsx?['"]/g
	)) {
		const names = match[1]!.split(',').map((s) =>
			s
				.trim()
				.split(/\s+as\s+/)[0]!
				.trim()
		);
		for (const name of names) {
			if (name.endsWith('Page')) components.add(name);
		}
	}
	return components;
}

function checkFrontendPages(): string[] {
	const errors: string[] = [];

	let appSource: string;
	try {
		appSource = readText(APP_FILE);
	} catch {
		errors.push(`  Cannot read frontend/src/App.tsx; frontend page check skipped.`);
		return errors;
	}

	const imported = extractAppPageImports(appSource);

	let pageFiles: string[];
	try {
		pageFiles = listPageFiles(PAGES_DIR);
	} catch {
		errors.push(`  Cannot read frontend/src/pages/; frontend page check skipped.`);
		return errors;
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
					`but is not imported in frontend/src/App.tsx`
			);
		}
	}

	return errors;
}

function main(): number {
	const allErrors: string[] = [];

	const backendErrors = checkBackendRoutes();
	if (backendErrors.length > 0) {
		allErrors.push('Backend route registration mismatches:', ...backendErrors);
	}

	const frontendErrors = checkFrontendPages();
	if (frontendErrors.length > 0) {
		allErrors.push('Frontend page registration mismatches:', ...frontendErrors);
	}

	if (allErrors.length > 0) {
		console.error('[FAIL] Feature integration check found issues:');
		for (const line of allErrors) {
			console.error(line);
		}
		return 1;
	}

	console.log('[OK] Feature integration check passed.');
	return 0;
}

if (import.meta.main) {
	void cwd();
	exit(main());
}
