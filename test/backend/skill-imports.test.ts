import { lstat, mkdir, readdir, readFile, rm, symlink, truncate } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { importedSkillRegistryPath, listSkillDefinitions } from 'aidd-shared/skills/catalog';

import { SkillService } from '../../backend/src/services/skillService.ts';
import { testTempDir } from '../_helpers/temp.ts';

async function writeSkill(root: string, id: string, description: string): Promise<string> {
	const path = join(root, id);
	await mkdir(path, { recursive: true });
	await Bun.write(
		join(path, 'SKILL.md'),
		`---\nname: ${id}\ndescription: ${description}\n---\n\n# ${id}\n\nBody.\n`
	);
	await mkdir(join(path, 'references'), { recursive: true });
	await Bun.write(join(path, 'references', 'notes.md'), 'notes');
	return path;
}

describe('managed skill imports', () => {
	test('previews and copies a package unchanged with provenance and merged discovery', async () => {
		const root = await testTempDir('aidd-skill-import-');
		const sourceRoot = join(root, 'source');
		const appRoot = join(root, 'app');
		const dataDir = join(root, 'data');
		try {
			const sourcePath = await writeSkill(sourceRoot, 'demo', 'Original description.');
			await mkdir(join(appRoot, 'skills'), { recursive: true });
			const service = new SkillService({
				allowedRoots: [sourceRoot],
				dataDir,
				rootDir: appRoot,
			});

			const preview = await service.previewImport({ category: 'general', sourcePath });
			expect(preview).toMatchObject({
				category: 'general',
				conflict: 'none',
				fileCount: 2,
				id: 'demo',
			});
			expect(preview.sourceSha256).toHaveLength(64);

			const imported = await service.importSkill({ category: 'general', sourcePath });
			expect(imported.origin).toBe('imported');
			expect(imported.imported).toMatchObject({
				category: 'general',
				sourcePath: await lstat(sourcePath).then(() => sourcePath),
				sourceSha256: preview.sourceSha256,
			});
			expect(await readFile(join(dataDir, 'skills', 'demo', 'SKILL.md'), 'utf8')).toBe(
				await readFile(join(sourcePath, 'SKILL.md'), 'utf8')
			);
			const registry = JSON.parse(
				await readFile(importedSkillRegistryPath(dataDir), 'utf8')
			) as {
				schemaVersion: number;
				skills: Record<string, { sourceSha256: string }>;
			};
			expect(registry.schemaVersion).toBe(1);
			expect(registry.skills.demo?.sourceSha256).toBe(preview.sourceSha256);
			expect((await listSkillDefinitions(appRoot, dataDir)).map((skill) => skill.id)).toEqual(
				['demo']
			);
		} finally {
			await rm(root, { force: true, recursive: true });
		}
	});

	test('requires explicit replacement and never replaces a bundled skill', async () => {
		const root = await testTempDir('aidd-skill-replace-');
		const sourceRoot = join(root, 'source');
		const appRoot = join(root, 'app');
		const dataDir = join(root, 'data');
		try {
			const sourcePath = await writeSkill(sourceRoot, 'demo', 'First.');
			await mkdir(join(appRoot, 'skills'), { recursive: true });
			const service = new SkillService({
				allowedRoots: [sourceRoot],
				dataDir,
				rootDir: appRoot,
			});
			await service.importSkill({ sourcePath });
			await Bun.write(
				join(sourcePath, 'SKILL.md'),
				'---\nname: demo\ndescription: Replacement.\n---\n\n# Demo replacement\n'
			);
			await expect(service.importSkill({ sourcePath })).rejects.toMatchObject({
				status: 409,
			});
			const replaced = await service.importSkill({ replace: true, sourcePath });
			expect(replaced.description).toBe('Replacement.');

			await mkdir(join(appRoot, 'skills', 'bundled'), { recursive: true });
			await Bun.write(
				join(appRoot, 'skills', 'bundled', 'SKILL.md'),
				'---\nname: bundled\ndescription: Bundled.\nmetadata:\n  aidd-category: runtime\n---\n\n# Bundled\n'
			);
			const bundledSource = await writeSkill(sourceRoot, 'bundled', 'Imported.');
			await expect(
				service.importSkill({ replace: true, sourcePath: bundledSource })
			).rejects.toMatchObject({ status: 409 });
		} finally {
			await rm(root, { force: true, recursive: true });
		}
	});

	test('rejects paths outside allowed roots, storage recursion, links, and oversized files', async () => {
		const root = await testTempDir('aidd-skill-guards-');
		const sourceRoot = join(root, 'source');
		const outsideRoot = join(root, 'outside');
		const appRoot = join(root, 'app');
		const dataDir = join(root, 'data');
		try {
			await mkdir(join(appRoot, 'skills'), { recursive: true });
			const service = new SkillService({
				allowedRoots: [sourceRoot],
				dataDir,
				rootDir: appRoot,
			});
			const outside = await writeSkill(outsideRoot, 'outside', 'Outside.');
			await expect(service.previewImport({ sourcePath: outside })).rejects.toMatchObject({
				status: 400,
			});

			const linked = await writeSkill(sourceRoot, 'linked', 'Linked.');
			await symlink(join(linked, 'references'), join(linked, 'linked-reference'), 'junction');
			await expect(service.previewImport({ sourcePath: linked })).rejects.toMatchObject({
				status: 400,
			});
			const linkedRootTarget = await writeSkill(
				join(sourceRoot, 'targets'),
				'linked-root',
				'Linked root.'
			);
			const linkedRoot = join(sourceRoot, 'linked-root');
			await symlink(linkedRootTarget, linkedRoot, 'junction');
			await expect(service.previewImport({ sourcePath: linkedRoot })).rejects.toMatchObject({
				status: 400,
			});

			const large = await writeSkill(sourceRoot, 'large', 'Large.');
			const largeFile = join(large, 'large.bin');
			await Bun.write(largeFile, '');
			await truncate(largeFile, 25 * 1024 * 1024 + 1);
			await expect(service.previewImport({ sourcePath: large })).rejects.toMatchObject({
				status: 400,
			});

			const recursiveService = new SkillService({
				allowedRoots: [dataDir],
				dataDir,
				rootDir: appRoot,
			});
			const recursive = await writeSkill(join(dataDir, 'skills'), 'recursive', 'Recursive.');
			await expect(
				recursiveService.previewImport({ sourcePath: recursive })
			).rejects.toMatchObject({
				status: 400,
			});
		} finally {
			await rm(root, { force: true, recursive: true });
		}
	});

	test('rejects packages over the aggregate file-count and byte limits', async () => {
		const root = await testTempDir('aidd-skill-package-limits-');
		const sourceRoot = join(root, 'source');
		const appRoot = join(root, 'app');
		const dataDir = join(root, 'data');
		try {
			await mkdir(join(appRoot, 'skills'), { recursive: true });
			const service = new SkillService({
				allowedRoots: [sourceRoot],
				dataDir,
				rootDir: appRoot,
			});
			const numerous = await writeSkill(sourceRoot, 'numerous', 'Numerous.');
			for (let index = 0; index < 2_000; index += 1) {
				await Bun.write(join(numerous, `file-${index}.txt`), 'x');
			}
			await expect(service.previewImport({ sourcePath: numerous })).rejects.toMatchObject({
				status: 400,
			});

			const largeTotal = await writeSkill(sourceRoot, 'large-total', 'Large total.');
			for (let index = 0; index < 5; index += 1) {
				const file = join(largeTotal, `large-${index}.bin`);
				await Bun.write(file, '');
				await truncate(file, 21 * 1024 * 1024);
			}
			await expect(service.previewImport({ sourcePath: largeTotal })).rejects.toMatchObject({
				status: 400,
			});
		} finally {
			await rm(root, { force: true, recursive: true });
		}
	});

	test('serializes concurrent same-id imports so the loser cannot destroy the winner', async () => {
		const root = await testTempDir('aidd-skill-concurrent-');
		const sourceRoot = join(root, 'source');
		const appRoot = join(root, 'app');
		const dataDir = join(root, 'data');
		try {
			const sourcePath = await writeSkill(sourceRoot, 'demo', 'Concurrent.');
			await mkdir(join(appRoot, 'skills'), { recursive: true });
			const service = new SkillService({
				allowedRoots: [sourceRoot],
				dataDir,
				rootDir: appRoot,
			});
			const results = await Promise.allSettled([
				service.importSkill({ sourcePath }),
				service.importSkill({ sourcePath }),
			]);
			const rejected = results.filter(
				(result): result is PromiseRejectedResult => result.status === 'rejected'
			);
			expect(results.length - rejected.length).toBe(1);
			expect(rejected).toHaveLength(1);
			expect(rejected[0]?.reason).toMatchObject({ status: 409 });
			expect((await service.readSkill('demo')).description).toBe('Concurrent.');
			expect((await listSkillDefinitions(appRoot, dataDir)).map((skill) => skill.id)).toEqual(
				['demo']
			);
			expect(
				(await readdir(join(dataDir, 'skills'))).filter((name) => name.startsWith('.'))
			).toEqual([]);
		} finally {
			await rm(root, { force: true, recursive: true });
		}
	});

	test('keeps existing storage intact on a failed replacement and protects referenced deletion', async () => {
		const root = await testTempDir('aidd-skill-atomic-');
		const sourceRoot = join(root, 'source');
		const appRoot = join(root, 'app');
		const dataDir = join(root, 'data');
		try {
			const sourcePath = await writeSkill(sourceRoot, 'demo', 'Stable.');
			await mkdir(join(appRoot, 'skills'), { recursive: true });
			const service = new SkillService({
				allowedRoots: [sourceRoot],
				dataDir,
				rootDir: appRoot,
			});
			await service.importSkill({ sourcePath });
			await Bun.write(
				join(sourcePath, 'SKILL.md'),
				'---\nname: wrong\ndescription: Bad.\n---\n# Bad\n'
			);
			await expect(service.importSkill({ replace: true, sourcePath })).rejects.toMatchObject({
				status: 400,
			});
			expect((await service.readSkill('demo')).description).toBe('Stable.');
			expect(
				(await readdir(join(dataDir, 'skills'))).filter((name) => name.startsWith('.'))
			).toEqual([]);

			await expect(
				service.deleteImportedSkill('demo', ['recipe:demo-recipe'])
			).rejects.toMatchObject({
				status: 409,
			});
			await service.deleteImportedSkill('demo', []);
			await expect(service.readSkill('demo')).rejects.toMatchObject({ status: 404 });
		} finally {
			await rm(root, { force: true, recursive: true });
		}
	});
});
