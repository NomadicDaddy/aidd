import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export type CommandArgs = readonly [string, ...string[]];

export interface ProjectPackageJson {
	scripts?: Record<string, unknown>;
	spernakit_version?: unknown;
	stack?: unknown;
}

export function commandLabel(command: CommandArgs): string {
	return command.join(' ');
}

export function hasPackageScript(pkg: ProjectPackageJson, name: 'dev' | 'start' | 'stop'): boolean {
	return typeof pkg.scripts?.[name] === 'string';
}

export function isSpernakitPackage(pkg: ProjectPackageJson): boolean {
	const stack = typeof pkg.stack === 'string' ? pkg.stack : null;
	return typeof pkg.spernakit_version === 'string' || stack?.startsWith('spernakit') === true;
}

export async function readProjectPackage(projectPath: string): Promise<null | ProjectPackageJson> {
	try {
		const raw = await readFile(join(projectPath, 'package.json'), 'utf8');
		const parsed = JSON.parse(raw) as unknown;
		return parsed && typeof parsed === 'object' ? (parsed as ProjectPackageJson) : null;
	} catch {
		return null;
	}
}

export function isPidAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

export type AppLaunchStatus = 'crashed' | 'running' | 'stopped';

export interface AppLaunchRecord {
	command: string;
	pid: null | number;
	projectId: string;
	projectPath: string;
	startedAt: null | number;
	status: AppLaunchStatus;
	stoppedAt: null | number;
}
