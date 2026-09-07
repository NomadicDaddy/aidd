import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface PackageJsonShape {
	version?: unknown;
}

export interface VersionInfo {
	changelogEntry: string;
	changelogVersion: string;
	packageVersion: string;
	versionFile: string;
}

// LICENSE, THIRD-PARTY-LICENSES.md and licenses/ are not optional extras: they are what tells a
// recipient of the source tree what they received and under which terms. Do not drop them from
// this list.
export const PUBLIC_DOCUMENT_FILE_ASSETS = [
	'README.md',
	'CONTRIBUTING.md',
	'CODE_OF_CONDUCT.md',
	'SECURITY.md',
	'SUPPORT.md',
	'PRIVACY.md',
	'LICENSE',
	'THIRD-PARTY-LICENSES.md',
	'THIRD-PARTY-NOTICES.md',
] as const;

export const PUBLIC_DOCUMENT_ROOT_ASSETS = ['licenses', 'docs'] as const;

export function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export async function readVersionInfo(rootDir: string): Promise<VersionInfo> {
	const versionFile = (await readFile(join(rootDir, 'VERSION'), 'utf8')).trim();
	const packageText = await readFile(join(rootDir, 'package.json'), 'utf8');
	const packageJson = JSON.parse(packageText) as PackageJsonShape;
	if (typeof packageJson.version !== 'string') {
		throw new Error('package.json version must be a string');
	}
	const changelogText = await readFile(join(rootDir, 'docs', 'CHANGELOG.md'), 'utf8');
	const changelogMatch = /^## \[([^\]]+)\].*$/m.exec(changelogText);
	if (!changelogMatch?.[1]) {
		throw new Error('docs/CHANGELOG.md must start with a version heading');
	}
	return {
		changelogEntry: extractChangelogEntry(changelogText, changelogMatch[1]),
		changelogVersion: changelogMatch[1],
		packageVersion: packageJson.version,
		versionFile,
	};
}

export function assertVersionParity(info: VersionInfo): string[] {
	const issues: string[] = [];
	if (info.versionFile !== info.packageVersion) {
		issues.push(
			`VERSION (${info.versionFile}) does not match package.json (${info.packageVersion})`,
		);
	}
	if (info.changelogVersion !== info.packageVersion) {
		issues.push(
			`docs/CHANGELOG.md latest version (${info.changelogVersion}) does not match package.json (${info.packageVersion})`,
		);
	}
	return issues;
}

export function formatReleaseNotes(info: VersionInfo): string {
	return [`# aidd v${info.packageVersion}`, '', info.changelogEntry.trim(), ''].join('\n');
}

function extractChangelogEntry(changelogText: string, version: string): string {
	const heading = `## [${version}]`;
	const start = changelogText.indexOf(heading);
	if (start < 0) throw new Error(`Could not find changelog entry for ${version}`);
	const next = changelogText.indexOf('\n## [', start + heading.length);
	return changelogText.slice(start, next < 0 ? undefined : next).trim();
}
