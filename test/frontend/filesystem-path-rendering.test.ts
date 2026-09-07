import { describe, expect, test } from 'bun:test';
import { join, resolve } from 'node:path';

import { formatFilesystemPath } from '../../frontend/src/lib/formatters.ts';
import { projectPathsMatch } from '../../frontend/src/pages/projects/detail/managementPaths.ts';

const ROOT = resolve(import.meta.dir, '../..');

function read(path: string): Promise<string> {
	return Bun.file(join(ROOT, path)).text();
}

function stripComments(source: string): string {
	return source.replaceAll(/\/\*[\s\S]*?\*\//g, '').replaceAll(/\/\/[^\n]*/g, '');
}

describe('one path renders one way', () => {
	test('normalisation, monospace, and reversible abbreviation live together', async () => {
		const component = await read('frontend/src/components/shared/FilePath.tsx');

		expect(component).toContain('const display = formatFilesystemPath(path)');
		expect(component).toContain('const full = formatFilesystemPath(title ?? path)');
		expect(component).toContain("'font-mono'");
		expect(component).toContain('title={full}');
	});

	test('the normaliser settles case, separators and trailing slashes', () => {
		const B = String.fromCharCode(92);

		expect(formatFilesystemPath(`d:${B}applications${B}aidd`)).toBe('D:/applications/aidd');
		expect(formatFilesystemPath('D:/applications/aidd/')).toBe('D:/applications/aidd');
		expect(formatFilesystemPath(`C:${B}`)).toBe('C:/');
		expect(formatFilesystemPath(`${B}${B}server${B}share${B}x`)).toBe('//server/share/x');
		expect(formatFilesystemPath('/srv/aidd/')).toBe('/srv/aidd');
		expect(formatFilesystemPath(null)).toBe('');
		expect(formatFilesystemPath(undefined)).toBe('');
	});

	test('repository and project-management paths use the shared renderer', async () => {
		const contracts: Record<string, string[]> = {
			'frontend/src/pages/projects/detail/MoveProjectCard.tsx': [
				'formatFilesystemPath(root)',
				'path={destinationPreview}',
			],
			'frontend/src/pages/projects/detail/RenameProjectCard.tsx': ['path={renamePreview}'],
			'frontend/src/pages/projects/detail/RepositoryRefsCard.tsx': ['path={worktree.path}'],
			'frontend/src/pages/projects/detail/workingTree/WorkingTreeList.tsx': [
				'path={file.path}',
				'path={file.origPath}',
			],
			'frontend/src/pages/projects/detail/workingTree/WorkingTreeTable.tsx': [
				'path={file.path}',
				'path={file.origPath}',
			],
		};

		for (const [file, required] of Object.entries(contracts)) {
			const source = await read(file);
			for (const expression of required) expect(source, file).toContain(expression);
		}
	});

	test('no page renders a project path as bare text', async () => {
		const offenders: string[] = [];

		for await (const relative of new Bun.Glob('frontend/src/pages/**/*.tsx').scan(ROOT)) {
			const file = relative.replaceAll('\\', '/');
			const source = stripComments(await read(file));
			for (const [match] of source.matchAll(
				/(?<![=\w$])\{(?:selectedLaunchProject|project|detail|candidate)\.path\}/g,
			)) {
				offenders.push(`${file}: ${match}`);
			}
		}
		expect(offenders).toEqual([]);
	});

	test('the delete confirmation accepts display spelling without revealing the answer', async () => {
		const card = await read('frontend/src/pages/projects/detail/DeleteProjectCard.tsx');

		expect(card).toContain('placeholder="Full project path"');
		expect(card).toContain('error={confirmationError}');
		expect(card).toContain('confirmation: project.path');
		expect(
			projectPathsMatch('D:/applications/agentwatch', 'd:\\applications\\agentwatch'),
		).toBe(true);
		expect(
			projectPathsMatch('D:/applications/agentwatch/', 'd:\\applications\\agentwatch'),
		).toBe(true);
		expect(
			projectPathsMatch('D:/applications/agentwatch-copy', 'd:\\applications\\agentwatch'),
		).toBe(false);
	});

	test('project relocation confirmations support copying and literal phone entry', async () => {
		const [component, deletion, move] = await Promise.all([
			read('frontend/src/components/shared/FilePath.tsx'),
			read('frontend/src/pages/projects/detail/DeleteProjectCard.tsx'),
			read('frontend/src/pages/projects/detail/MoveProjectCard.tsx'),
		]);

		expect(component).toContain('copyable = false');
		expect(component).toContain('ariaLabel="Copy project path"');
		for (const source of [deletion, move]) {
			expect(source).toContain('copyable');
			expect(source).toContain('autoCapitalize="none"');
			expect(source).toContain('autoComplete="off"');
			expect(source).toContain('autoCorrect="off"');
			expect(source).toContain('spellCheck={false}');
		}
	});
});
