import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';

function object(value: unknown): Record<string, unknown> {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new Error('Audit dependency setup requires an object manifest and text Bun lock.');
	}
	return value as Record<string, unknown>;
}

function inside(root: string, target: string): boolean {
	const relative = path.relative(root, target);
	return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function localSpec(value: string): string {
	const protocol = /(?:^|@)((?:file|link|workspace):.+)$/.exec(value)?.[1];
	return protocol ?? value.slice(value.lastIndexOf('@') + 1);
}

function localPath(value: string): string | undefined {
	const spec = localSpec(value);
	const protocol = /^(file|link|workspace):(.+)$/.exec(spec);
	if (protocol?.[1] === 'workspace' && /^[*^~<>=\d]/.test(protocol[2]!)) return undefined;
	if (protocol) return protocol[2]!;
	return /^(?:[./\\]|[A-Za-z]:)/.test(spec) ? spec : undefined;
}

/** Check both lexical containment and existing ancestors: workspace globs may not exist yet,
 * but a junction or symlink in their prefix must not redirect installation to a live sibling. */
function checkLocalPath(root: string, base: string, value: string): void {
	if (path.posix.isAbsolute(value) || path.win32.isAbsolute(value)) {
		throw new Error('Audit dependency setup refuses an absolute local dependency reference.');
	}
	const target = path.resolve(base, value.replaceAll('\\', '/'));
	if (!inside(root, target)) throw new Error('Audit dependency reference escapes its checkout.');
	let ancestor = target;
	while (!existsSync(ancestor)) ancestor = path.dirname(ancestor);
	if (!inside(root, realpathSync(ancestor))) {
		throw new Error('Audit dependency reference resolves outside its checkout.');
	}
}

function checkDependencyMap(root: string, base: string, value: unknown): void {
	if (value === undefined) return;
	for (const dependency of Object.values(object(value))) {
		if (typeof dependency !== 'string') continue;
		const local = localPath(dependency);
		if (local !== undefined) checkLocalPath(root, base, local);
	}
}

function checkWorkspacePatterns(root: string, base: string, value: unknown): void {
	if (value === undefined) return;
	const patterns = Array.isArray(value) ? value : object(value).packages;
	if (!Array.isArray(patterns)) throw new Error('Unsupported audit workspace declaration.');
	for (const pattern of patterns) {
		if (typeof pattern !== 'string') throw new Error('Unsupported audit workspace path.');
		checkLocalPath(root, base, pattern);
	}
}

function checkManifest(root: string, directory: string): void {
	const manifest = object(JSON.parse(readFileSync(path.join(directory, 'package.json'), 'utf8')));
	if (
		manifest.packageManager !== undefined &&
		!String(manifest.packageManager).startsWith('bun@')
	) {
		throw new Error('Audit dependency setup supports committed Bun projects only.');
	}
	for (const field of [
		'dependencies',
		'devDependencies',
		'optionalDependencies',
		'peerDependencies',
	]) {
		checkDependencyMap(root, directory, manifest[field]);
	}
	checkWorkspacePatterns(root, directory, manifest.workspaces);
}

function checkLockPackages(root: string, packages: unknown): void {
	for (const entry of Object.values(object(packages))) {
		if (!Array.isArray(entry) || typeof entry[0] !== 'string') continue;
		const local = localPath(entry[0]);
		if (local !== undefined) checkLocalPath(root, root, local);
	}
}

/** No JS manifest needs no install. Other projects fail closed instead of migrating a lock or
 * silently installing an incomplete dependency tree. Bun itself checks manifest/lock agreement. */
export function needsAuditDependencyInstall(directory: string): boolean {
	if (!existsSync(path.join(directory, 'package.json'))) return false;
	const root = realpathSync(directory);
	const lockPath = path.join(root, 'bun.lock');
	if (!existsSync(lockPath)) {
		throw new Error(
			'Audit dependency setup requires a committed text bun.lock; no lock migration.',
		);
	}
	const lock = object(Bun.JSONC.parse(readFileSync(lockPath, 'utf8')));
	const workspaces = object(lock.workspaces);
	if (existsSync(path.join(root, 'bunfig.toml'))) checkLocalPath(root, root, 'bunfig.toml');
	checkManifest(root, root);
	for (const workspace of Object.keys(workspaces).filter(Boolean)) {
		checkLocalPath(root, root, workspace);
		checkManifest(root, path.resolve(root, workspace));
	}
	checkLockPackages(root, lock.packages);
	return true;
}
