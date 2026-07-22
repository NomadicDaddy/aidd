import { basename } from 'node:path';

export interface ArchiveEntry {
	isDirectory: boolean;
	path: string;
}

export interface ReleaseArchive {
	entries: ArchiveEntry[];
	readText: (path: string) => Promise<string>;
}

interface ArchiveCommand {
	list: string[];
	read: (archivePath: string, entryPath: string) => string[];
}

const ARCHIVE_COMMANDS: ArchiveCommand[] = [
	{
		list: ['unzip', '-Z1'],
		read: (archivePath, entryPath) => ['unzip', '-p', archivePath, entryPath],
	},
	{
		list: ['tar', '-tf'],
		read: (archivePath, entryPath) => ['tar', '-xOf', archivePath, entryPath],
	},
];

export function normalizeArchivePath(rawPath: string): ArchiveEntry {
	const slashPath = rawPath.trim().replaceAll('\\', '/').replace(/^\.\//, '');
	const isDirectory = slashPath.endsWith('/');
	const path = slashPath.replace(/\/$/, '');
	const segments = path.split('/');
	if (
		path.length === 0 ||
		path.startsWith('/') ||
		/^[A-Za-z]:\//.test(path) ||
		segments.some((segment) => segment === '' || segment === '.' || segment === '..')
	) {
		throw new Error(`Unsafe archive entry path: ${rawPath}`);
	}
	return { isDirectory, path };
}

export async function openReleaseArchive(archivePath: string): Promise<ReleaseArchive> {
	for (const command of ARCHIVE_COMMANDS) {
		const listing = await run([...command.list, archivePath]);
		if (listing === null || listing.trim().length === 0) continue;

		const rawPaths = listing.split(/\r?\n/).filter((line) => line.trim().length > 0);
		const rawByPath = new Map<string, string>();
		const entries = rawPaths.map((rawPath) => {
			const entry = normalizeArchivePath(rawPath);
			if (rawByPath.has(entry.path)) {
				throw new Error(`Duplicate archive entry path: ${entry.path}`);
			}
			rawByPath.set(entry.path, rawPath.trim());
			return entry;
		});

		return {
			entries,
			readText: async (path) => {
				const rawPath = rawByPath.get(path);
				if (rawPath === undefined) {
					throw new Error(`${basename(archivePath)} has no entry named ${path}`);
				}
				const text = await run(command.read(archivePath, rawPath));
				if (text === null) {
					throw new Error(`Could not read ${path} from ${basename(archivePath)}`);
				}
				return text;
			},
		};
	}
	throw new Error(`Could not read ${basename(archivePath)} with unzip or tar`);
}

async function run(command: string[]): Promise<null | string> {
	try {
		const proc = Bun.spawn(command, {
			stderr: 'ignore',
			stdout: 'pipe',
			windowsHide: true,
		});
		const stdout = await new Response(proc.stdout).text();
		return (await proc.exited) === 0 ? stdout : null;
	} catch {
		return null;
	}
}
