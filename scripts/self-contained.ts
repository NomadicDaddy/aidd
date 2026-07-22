import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';

const requiredPaths = [
	'backend',
	'cli',
	'shared',
	'test',
	'audits',
	'docs',
	'skills',
	'prompts',
	'scaffolding',
	'scripts',
	'package.json',
	'tsconfig.json',
];

const requiredScaffoldingFiles = [
	'scaffolding/.editorconfig',
	'scaffolding/.gitattributes',
	'scaffolding/.gitignore',
	'scaffolding/.prettierignore',
	'scaffolding/.prettierrc',
	'scaffolding/eslint.config.js',
	'scaffolding/frontend/eslint.config.js',
];

const scannedPaths = [
	'package.json',
	'backend/src',
	'cli/src',
	'docs',
	'frontend/src',
	'skills',
	'prompts',
	'scripts',
	'shared/src',
];
const ignoredScanFiles = new Set(['docs/CHANGELOG.md']);
const ignoredScanPrefixes = ['backend/src/db/migrations/'];

const staleRuntimeName = 'aidd' + '2';
const externalSourceRootName = 'a' + 'i';
const legacyNestedRuntimeName = 'aidd' + '-core';
const retiredCatalogName = 'ingre' + 'dient';

const forbiddenReferenceGroups = [
	{
		label: `D:\\applications\\${staleRuntimeName} or ${staleRuntimeName}`,
		patterns: [
			new RegExp(
				`${String.raw`D:\\applications\\${staleRuntimeName}(?:\\|`}\`${String.raw`|\s|$)`}`,
				'i'
			),
			new RegExp(
				`${String.raw`/d/applications/${staleRuntimeName}(?:/|`}\`${String.raw`|\s|$)`}`,
				'i'
			),
			new RegExp(
				`${String.raw`/mnt/d/applications/${staleRuntimeName}(?:/|`}\`${String.raw`|\s|$)`}`,
				'i'
			),
			new RegExp(String.raw`\b${staleRuntimeName}\b`, 'i'),
		],
	},
	{
		label: `D:\\applications\\${externalSourceRootName}`,
		patterns: [
			new RegExp(
				`${String.raw`D:\\applications\\${externalSourceRootName}(?:\\|`}\`${String.raw`|\s|$)`}`,
				'i'
			),
			new RegExp(
				`${String.raw`d:/applications/${externalSourceRootName}(?:/|`}\`${String.raw`|\s|$)`}`,
				'i'
			),
			new RegExp(
				`${String.raw`/d/applications/${externalSourceRootName}(?:/|`}\`${String.raw`|\s|$)`}`,
				'i'
			),
			new RegExp(
				`${String.raw`/mnt/d/applications/${externalSourceRootName}(?:/|`}\`${String.raw`|\s|$)`}`,
				'i'
			),
		],
	},
	{
		label: legacyNestedRuntimeName,
		patterns: [new RegExp(String.raw`\b${legacyNestedRuntimeName}\b`, 'i')],
	},
	{
		label: `retired ${retiredCatalogName} catalog terminology`,
		patterns: [new RegExp(String.raw`\b${retiredCatalogName}s?\b`, 'i')],
	},
];

async function pathExists(path: string): Promise<boolean> {
	try {
		await stat(path);
		return true;
	} catch (err) {
		if (typeof err === 'object' && err !== null && 'code' in err && err.code === 'ENOENT') {
			return false;
		}
		throw err;
	}
}

async function collectFiles(path: string): Promise<string[]> {
	const info = await stat(path);
	if (info.isFile()) return [path];
	const entries = await readdir(path, { withFileTypes: true });
	const files: string[] = [];
	for (const entry of entries) {
		const child = join(path, entry.name);
		if (entry.isDirectory()) files.push(...(await collectFiles(child)));
		else if (entry.isFile()) files.push(child);
	}
	return files;
}

function isTextFile(path: string): boolean {
	return /\.(?:ts|tsx|js|mjs|cjs|json|md|sh|ps1|txt|yml|yaml)$/i.test(path);
}

function findForbiddenRefs(path: string, text: string): string[] {
	const findings: string[] = [];
	const lines = text.split(/\r?\n/);
	for (const [index, line] of lines.entries()) {
		for (const group of forbiddenReferenceGroups) {
			if (group.patterns.some((pattern) => pattern.test(line))) {
				findings.push(`${path}:${index + 1}: [${group.label}] ${line.trim()}`);
				break;
			}
		}
	}
	return findings;
}

async function main(): Promise<number> {
	const root = process.cwd();
	const missing: string[] = [];
	for (const path of requiredPaths) {
		if (!(await pathExists(join(root, path)))) missing.push(path);
	}
	for (const path of requiredScaffoldingFiles) {
		if (!(await pathExists(join(root, path)))) missing.push(path);
	}

	const files: string[] = [];
	for (const path of scannedPaths) {
		const fullPath = join(root, path);
		if (await pathExists(fullPath)) files.push(...(await collectFiles(fullPath)));
	}

	const staleRefs: string[] = [];
	for (const file of files.filter(isTextFile)) {
		const relativePath = relative(root, file).replaceAll('\\', '/');
		if (
			ignoredScanFiles.has(relativePath) ||
			ignoredScanPrefixes.some((prefix) => relativePath.startsWith(prefix))
		)
			continue;
		const text = await readFile(file, 'utf8');
		staleRefs.push(...findForbiddenRefs(relativePath, text));
	}

	if (missing.length || staleRefs.length) {
		console.error('aidd self-contained check failed.');
		if (missing.length) {
			console.error('\nMissing required local paths:');
			for (const path of missing) console.error(`- ${path}`);
		}
		if (staleRefs.length) {
			console.error('\nForbidden external or stale runtime references:');
			for (const ref of staleRefs) console.error(`- ${ref}`);
		}
		return 1;
	}

	console.log('aidd self-contained check passed.');
	return 0;
}

process.exit(await main());
