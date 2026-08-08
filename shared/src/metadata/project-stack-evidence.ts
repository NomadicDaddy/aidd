import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export interface PackageJsonShape {
	bin?: unknown;
	dependencies?: Record<string, unknown>;
	description?: unknown;
	devDependencies?: Record<string, unknown>;
	engines?: Record<string, unknown>;
	main?: unknown;
	packageManager?: unknown;
	scripts?: Record<string, unknown>;
	spernakit_version?: unknown;
	stack?: unknown;
	workspaces?: unknown;
}

export interface StackEvidence {
	frameworks: Set<string>;
	languages: Set<string>;
	runtimes: Set<string>;
}

const DEPENDENCY_FRAMEWORKS = new Map<string, string>([
	['@angular/core', 'Angular'],
	['@nestjs/core', 'NestJS'],
	['@sveltejs/kit', 'SvelteKit'],
	['astro', 'Astro'],
	['convex', 'Convex'],
	['drizzle-orm', 'Drizzle'],
	['elysia', 'Elysia'],
	['express', 'Express'],
	['fastify', 'Fastify'],
	['hono', 'Hono'],
	['next', 'Next.js'],
	['react', 'React'],
	['svelte', 'Svelte'],
	['vite', 'Vite'],
	['vue', 'Vue'],
]);

const ECOSYSTEM_FILES = [
	'Cargo.toml',
	'Gemfile',
	'build.gradle',
	'build.gradle.kts',
	'composer.json',
	'deno.json',
	'deno.jsonc',
	'go.mod',
	'pom.xml',
	'pyproject.toml',
	'requirements.txt',
	'tsconfig.json',
] as const;

const MAX_MANIFESTS = 64;

async function fileExists(path: string): Promise<boolean> {
	try {
		return (await stat(path)).isFile();
	} catch {
		return false;
	}
}

export async function readProjectPackage(path: string): Promise<null | PackageJsonShape> {
	try {
		const parsed = JSON.parse(await readFile(path, 'utf8')) as unknown;
		return parsed !== null && typeof parsed === 'object' ? (parsed as PackageJsonShape) : null;
	} catch {
		return null;
	}
}

async function readText(path: string): Promise<null | string> {
	try {
		return await readFile(path, 'utf8');
	} catch {
		return null;
	}
}

function stringRecord(value: unknown): Record<string, unknown> {
	return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function workspacePatterns(value: unknown): string[] {
	if (Array.isArray(value))
		return value.filter((item): item is string => typeof item === 'string');
	const packages = stringRecord(value).packages;
	return Array.isArray(packages)
		? packages.filter((item): item is string => typeof item === 'string')
		: [];
}

async function expandWorkspacePattern(projectDir: string, pattern: string): Promise<string[]> {
	const normalized = pattern.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/$/, '');
	if (!normalized || normalized.includes('..') || normalized.includes('**')) return [];
	let paths = [projectDir];
	for (const segment of normalized.split('/')) {
		if (paths.length >= MAX_MANIFESTS) break;
		if (segment !== '*') {
			paths = paths.map((path) => join(path, segment));
			continue;
		}
		const expanded = await Promise.all(
			paths.map(async (path) => {
				try {
					return (await readdir(path, { withFileTypes: true }))
						.filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
						.map((entry) => join(path, entry.name));
				} catch {
					return [];
				}
			}),
		);
		paths = expanded.flat().slice(0, MAX_MANIFESTS);
	}
	return paths;
}

export async function projectPackageManifestPaths(projectDir: string): Promise<string[]> {
	const rootPath = join(projectDir, 'package.json');
	const rootPackage = await readProjectPackage(rootPath);
	if (!rootPackage) return [];
	const paths = new Set([rootPath]);
	for (const pattern of workspacePatterns(rootPackage.workspaces)) {
		for (const workspaceDir of await expandWorkspacePattern(projectDir, pattern)) {
			const path = join(workspaceDir, 'package.json');
			if (paths.size < MAX_MANIFESTS && (await fileExists(path))) paths.add(path);
		}
	}
	return [...paths].sort();
}

function dependencyNames(packages: PackageJsonShape[]): Set<string> {
	const names = new Set<string>();
	for (const pkg of packages) {
		for (const name of Object.keys({
			...stringRecord(pkg.dependencies),
			...stringRecord(pkg.devDependencies),
		})) {
			names.add(name);
		}
	}
	return names;
}

async function directoryFileNames(path: string): Promise<string[]> {
	try {
		return (await readdir(path, { withFileTypes: true }))
			.filter((entry) => entry.isFile())
			.map((entry) => entry.name);
	} catch {
		return [];
	}
}

async function sourceFileNames(projectDir: string, manifestPaths: string[]): Promise<string[]> {
	const directories = new Set<string>([join(projectDir, 'src'), projectDir]);
	for (const manifestPath of manifestPaths) {
		const packageDir = dirname(manifestPath);
		directories.add(packageDir);
		directories.add(join(packageDir, 'src'));
	}
	return (await Promise.all([...directories].map(directoryFileNames))).flat();
}

function hasExtension(names: string[], extensions: string[]): boolean {
	return names.some((name) =>
		extensions.some((extension) => name.toLowerCase().endsWith(extension)),
	);
}

function packageText(packages: PackageJsonShape[]): string {
	return packages
		.flatMap((pkg) => [
			typeof pkg.description === 'string' ? pkg.description : '',
			typeof pkg.main === 'string' ? pkg.main : '',
			...Object.values(stringRecord(pkg.scripts)).filter(
				(value): value is string => typeof value === 'string',
			),
		])
		.join('\n')
		.toLowerCase();
}

async function hasPodeEvidence(projectDir: string, names: string[], packageSummary: string) {
	if (packageSummary.includes('pode')) return true;
	const candidates = names.filter((name) => /\.(?:ps1|psd1|psm1)$/i.test(name)).slice(0, 12);
	for (const name of candidates) {
		const text = await readText(join(projectDir, name));
		if (text?.toLowerCase().includes('pode')) return true;
	}
	return false;
}

function addNativeEvidence(evidence: StackEvidence, names: string[], rootFiles: Set<string>): void {
	if (rootFiles.has('cargo.toml')) evidence.languages.add('Rust');
	if (rootFiles.has('gemfile')) evidence.languages.add('Ruby');
	if (rootFiles.has('go.mod')) evidence.languages.add('Go');
	if (rootFiles.has('composer.json')) evidence.languages.add('PHP');
	if (
		rootFiles.has('pom.xml') ||
		rootFiles.has('build.gradle') ||
		rootFiles.has('build.gradle.kts')
	) {
		evidence.languages.add('Java');
		evidence.runtimes.add('JVM');
	}
	if (
		rootFiles.has('pyproject.toml') ||
		rootFiles.has('requirements.txt') ||
		hasExtension(names, ['.py'])
	) {
		evidence.languages.add('Python');
	}
	if (hasExtension(names, ['.csproj', '.fsproj', '.sln'])) {
		evidence.languages.add('.NET');
		evidence.runtimes.add('.NET');
	}
	if (hasExtension(names, ['.bash', '.sh'])) evidence.languages.add('Shell');
}

export async function gatherProjectStackEvidence(projectDir: string): Promise<StackEvidence> {
	const manifestPaths = await projectPackageManifestPaths(projectDir);
	const packages = (
		await Promise.all(manifestPaths.map(async (path) => await readProjectPackage(path)))
	).filter((pkg): pkg is PackageJsonShape => pkg !== null);
	const dependencies = dependencyNames(packages);
	const names = await sourceFileNames(projectDir, manifestPaths);
	const evidence: StackEvidence = {
		frameworks: new Set(),
		languages: new Set(),
		runtimes: new Set(),
	};
	for (const [dependency, framework] of DEPENDENCY_FRAMEWORKS) {
		if (dependencies.has(dependency)) evidence.frameworks.add(framework);
	}
	const rootFiles = new Set(names.map((name) => name.toLowerCase()));
	for (const file of ECOSYSTEM_FILES) {
		if (await fileExists(join(projectDir, file))) rootFiles.add(file.toLowerCase());
	}
	addNativeEvidence(evidence, names, rootFiles);
	if (hasExtension(names, ['.ps1', '.psd1', '.psm1'])) {
		evidence.languages.add('PowerShell');
		if (await hasPodeEvidence(projectDir, names, packageText(packages)))
			evidence.frameworks.add('Pode');
	}
	const hasTypeScript =
		rootFiles.has('tsconfig.json') ||
		dependencies.has('typescript') ||
		hasExtension(names, ['.ts', '.tsx']);
	const hasTypeScriptSource = hasExtension(names, ['.ts', '.tsx']);
	const hasJavaScript = hasExtension(names, ['.js', '.jsx', '.mjs', '.cjs']);
	const hasJavaScriptFramework = [...DEPENDENCY_FRAMEWORKS.keys()].some((dependency) =>
		dependencies.has(dependency),
	);
	const hasNonJavaScriptApplication = [...evidence.languages].some(
		(language) => language !== 'JavaScript' && language !== 'TypeScript',
	);
	const hasJavaScriptApplication =
		hasJavaScriptFramework ||
		hasTypeScriptSource ||
		(hasJavaScript && !hasNonJavaScriptApplication);
	if (hasTypeScript && (!hasNonJavaScriptApplication || hasJavaScriptApplication)) {
		evidence.languages.add('TypeScript');
	} else if (hasJavaScriptApplication) {
		evidence.languages.add('JavaScript');
	}
	const packageManagers = packages
		.map((pkg) => (typeof pkg.packageManager === 'string' ? pkg.packageManager : ''))
		.join(' ')
		.toLowerCase();
	const hasBun =
		(await fileExists(join(projectDir, 'bun.lock'))) ||
		(await fileExists(join(projectDir, 'bun.lockb'))) ||
		packageManagers.includes('bun@') ||
		packages.some((pkg) => typeof stringRecord(pkg.engines).bun === 'string');
	const hasDeno = rootFiles.has('deno.json') || rootFiles.has('deno.jsonc');
	if (hasBun && hasJavaScriptApplication) evidence.runtimes.add('Bun');
	else if (hasDeno && hasJavaScriptApplication) evidence.runtimes.add('Deno');
	else if (hasJavaScriptApplication) evidence.runtimes.add('Node.js');
	return evidence;
}
