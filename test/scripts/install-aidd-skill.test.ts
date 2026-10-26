import { describe, expect, test } from 'bun:test';
import { copyFile, mkdir, readFile, rename, symlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { installAiddSkill, skillInstallRoot } from '../../scripts/install-aidd-skill.ts';
import { testTempDir } from '../_helpers/temp.ts';

const sourceRoot = resolve(import.meta.dir, '../..');

describe('optional aidd launcher installation', () => {
	test('uses normal user skill roots only when explicitly selected', () => {
		const home = resolve('fixture-home');
		expect(skillInstallRoot(['--agent', 'codex'], home)).toBe(join(home, '.agents/skills'));
		expect(skillInstallRoot(['--agent', 'claude'], home)).toBe(join(home, '.claude/skills'));
		expect(() => skillInstallRoot([], home)).toThrow('Usage:');
		expect(() => skillInstallRoot(['--agent', 'codex', '--directory', home], home)).toThrow(
			'not both',
		);
		expect(() => skillInstallRoot(['--directory', ''], home)).toThrow('must not be empty');
	});

	test('copies canonical bytes, records the source installation, and reinstalls identically', async () => {
		const dir = await testTempDir('aidd-skill-install-');
		const target = await installAiddSkill(sourceRoot, dir);
		for (const file of ['SKILL.md', 'agents/openai.yaml']) {
			expect(await readFile(join(target, file))).toEqual(
				await readFile(join(sourceRoot, 'skills/aidd', file)),
			);
		}
		const before = await readFile(join(target, 'installation.json'), 'utf8');
		expect(JSON.parse(before).aiddRoot).toBe(sourceRoot);
		expect(await installAiddSkill(sourceRoot, dir)).toBe(target);
		expect(await readFile(join(target, 'installation.json'), 'utf8')).toBe(before);
	});

	test('preserves unmanaged and locally edited skill packages', async () => {
		const dir = await testTempDir('aidd-skill-preserve-');
		const unmanaged = join(dir, 'unmanaged');
		await mkdir(join(unmanaged, 'aidd'), { recursive: true });
		await writeFile(join(unmanaged, 'aidd/SKILL.md'), 'user-owned');
		await expect(installAiddSkill(sourceRoot, unmanaged)).rejects.toThrow('unmanaged');
		expect(await readFile(join(unmanaged, 'aidd/SKILL.md'), 'utf8')).toBe('user-owned');
		const target = await installAiddSkill(sourceRoot, join(dir, 'managed'));
		await writeFile(join(target, 'SKILL.md'), 'local edit');
		await expect(installAiddSkill(sourceRoot, join(dir, 'managed'))).rejects.toThrow(
			'locally changed',
		);
		expect(await readFile(join(target, 'SKILL.md'), 'utf8')).toBe('local edit');
	});

	test('updates an unchanged managed copy from the canonical source', async () => {
		const dir = await testTempDir('aidd-skill-update-');
		const root = join(dir, 'source');
		await mkdir(join(root, 'skills/aidd/agents'), { recursive: true });
		await mkdir(join(root, 'scripts'), { recursive: true });
		await writeFile(join(root, 'package.json'), '{"name":"aidd"}');
		await copyFile(
			join(sourceRoot, 'scripts/aidd-client.ts'),
			join(root, 'scripts/aidd-client.ts'),
		);
		for (const file of ['SKILL.md', 'agents/openai.yaml'])
			await copyFile(join(sourceRoot, 'skills/aidd', file), join(root, 'skills/aidd', file));
		const skills = join(dir, 'installed');
		const target = await installAiddSkill(root, skills);
		const revised = `${await readFile(join(root, 'skills/aidd/SKILL.md'), 'utf8')}\nFixture revision.\n`;
		await writeFile(join(root, 'skills/aidd/SKILL.md'), revised);
		await installAiddSkill(root, skills);
		expect(await readFile(join(target, 'SKILL.md'), 'utf8')).toBe(revised);
	});

	test('refuses a redirected support directory without changing its target', async () => {
		const dir = await testTempDir('aidd-skill-redirect-');
		const target = await installAiddSkill(sourceRoot, dir);
		const outside = join(dir, 'preserved-agents');
		await rename(join(target, 'agents'), outside);
		const before = await readFile(join(outside, 'openai.yaml'));
		await symlink(outside, join(target, 'agents'), 'junction');
		await expect(installAiddSkill(sourceRoot, dir)).rejects.toThrow('plain support directory');
		expect(await readFile(join(outside, 'openai.yaml'))).toEqual(before);
	});
});
