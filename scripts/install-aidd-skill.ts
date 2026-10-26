import { readSkillDefinition } from 'aidd-shared/skills/catalog';
import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { writeFileAtomic } from '../shared/src/lib/atomicWrite.ts';

const PACKAGE_FILES = ['SKILL.md', 'agents/openai.yaml'] as const;
const STATE_FILE = 'installation.json';

interface Installation {
	aiddRoot: string;
	hashes: Record<string, string>;
	schemaVersion: 1;
}

async function optionalFile(path: string): Promise<Buffer | null> {
	try {
		const entry = await lstat(path);
		if (!entry.isFile() || entry.isSymbolicLink())
			throw new Error(`Not a regular file: ${path}`);
		return await readFile(path);
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
		throw err;
	}
}

function digest(bytes: Uint8Array): string {
	return createHash('sha256').update(bytes).digest('hex');
}

async function verifyManagedInstall(target: string): Promise<void> {
	const entry = await lstat(target).catch((error: NodeJS.ErrnoException) => {
		if (error.code === 'ENOENT') return null;
		throw error;
	});
	if (entry === null) return;
	if (!entry.isDirectory() || entry.isSymbolicLink())
		throw new Error(`Not a plain skill directory: ${target}`);
	const agents = await lstat(join(target, 'agents')).catch((error: NodeJS.ErrnoException) => {
		if (error.code === 'ENOENT') return null;
		throw error;
	});
	if (agents !== null && (!agents.isDirectory() || agents.isSymbolicLink())) {
		throw new Error(`Not a plain support directory: ${join(target, 'agents')}`);
	}
	const raw = await optionalFile(join(target, STATE_FILE));
	if (raw === null) throw new Error(`Refusing to overwrite an unmanaged skill: ${target}`);
	const state = JSON.parse(raw.toString('utf8')) as Partial<Installation>;
	if (state.schemaVersion !== 1 || typeof state.aiddRoot !== 'string' || !state.hashes) {
		throw new Error(`Invalid aidd installation record: ${target}`);
	}
	for (const file of PACKAGE_FILES) {
		const bytes = await optionalFile(join(target, file));
		if (bytes === null || digest(bytes) !== state.hashes[file]) {
			throw new Error(
				`Preserving locally changed or missing skill file: ${join(target, file)}`,
			);
		}
	}
}

export function skillInstallRoot(argv: string[], userHome = homedir()): string {
	const { values } = parseArgs({
		args: argv,
		options: { agent: { type: 'string' }, directory: { type: 'string' } },
		strict: true,
	});
	if (values.agent !== undefined && values.directory !== undefined)
		throw new Error('Choose agent or directory, not both');
	if (values.directory !== undefined) {
		if (values.directory.trim() === '') throw new Error('directory must not be empty');
		return resolve(values.directory);
	}
	if (values.agent === 'codex') return join(userHome, '.agents', 'skills');
	if (values.agent === 'claude') return join(userHome, '.claude', 'skills');
	throw new Error(
		'Usage: bun run skill:install -- --agent codex|claude OR --directory <skills-root>',
	);
}

export async function installAiddSkill(aiddRoot: string, skillsRoot: string): Promise<string> {
	const root = resolve(aiddRoot);
	const identity = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')) as {
		name?: string;
	};
	if (
		identity.name !== 'aidd' ||
		(await optionalFile(join(root, 'scripts/aidd-client.ts'))) === null
	) {
		throw new Error(`Not an aidd source installation: ${root}`);
	}
	await readSkillDefinition(root, 'aidd');
	const target = join(resolve(skillsRoot), 'aidd');
	if (target === join(root, 'skills/aidd'))
		throw new Error('The canonical package is not an install destination');
	await verifyManagedInstall(target);
	const files = await Promise.all(
		PACKAGE_FILES.map(async (file) => ({
			bytes: await readFile(join(root, 'skills/aidd', file)),
			file,
		})),
	);
	const state: Installation = { aiddRoot: root, hashes: {}, schemaVersion: 1 };
	for (const { bytes, file } of files) {
		const destination = join(target, file);
		await mkdir(dirname(destination), { recursive: true });
		await writeFileAtomic(destination, bytes.toString('utf8'));
		state.hashes[file] = digest(bytes);
	}
	await writeFileAtomic(join(target, STATE_FILE), `${JSON.stringify(state, null, '\t')}\n`);
	return target;
}

if (import.meta.main) {
	const target = await installAiddSkill(
		resolve(import.meta.dir, '..'),
		skillInstallRoot(Bun.argv.slice(2)),
	);
	console.log(`Installed aidd launcher at ${target}`);
}
