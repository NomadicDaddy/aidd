/**
 * How git reads the words after a subcommand, and which of them make it discard work.
 *
 * Split out of shell-policy-git.ts, which finds the invocation; this file judges it. The rules
 * here follow git's own option parser rather than the spelling of a word: options stop at `--`, a
 * short cluster is read left to right and hands the rest of the word to the first letter that
 * takes a value, and a word consumed as a value is never a flag. Each of those was a way to make
 * the check see a dry run, a `--staged` or no force flag where git saw none.
 */

import { posix, resolve, sep } from 'node:path';

import { normalizePosixDrivePath } from './shell-policy-paths.ts';

/** Short options that take a value, per subcommand. The rest of the cluster is that value. */
const VALUE_SHORT: Record<string, string> = {
	apply: 'pC',
	checkout: 'bB',
	clean: 'e',
	restore: 's',
	switch: 'cC',
};

/** Long options whose value may be the next word, for the subcommands that grant an exemption. */
const VALUE_LONG: Record<string, string[]> = {
	clean: ['--exclude'],
	restore: ['--source', '--conflict', '--pathspec-from-file'],
};

/** True for `--hard`, and for any abbreviation of it that git would accept. */
export function isOption(arg: string, name: string): boolean {
	const spelled = arg.split('=')[0] ?? arg;
	return spelled === name || (spelled.length >= 3 && name.startsWith(spelled));
}

function hasOption(args: string[], ...names: string[]): boolean {
	return args.some((arg) => names.some((name) => isOption(arg, name)));
}

interface ReadOptions {
	/** Long options and anything else before `--` that was not consumed as a value. */
	long: string[];
	/** Every short flag letter git would act on. */
	short: Set<string>;
}

/** Git stops reading options at `--` and `--end-of-options`; every later word is a path. */
function optionWords(args: string[]): string[] {
	const end = args.findIndex((arg) => arg === '--' || arg === '--end-of-options');
	return end === -1 ? args : args.slice(0, end);
}

function readOptions(subcommand: string, args: string[]): ReadOptions {
	const valueShort = VALUE_SHORT[subcommand] ?? '';
	const valueLong = VALUE_LONG[subcommand] ?? [];
	const read: ReadOptions = { long: [], short: new Set() };
	let nextIsValue = false;
	for (const arg of optionWords(args)) {
		if (nextIsValue) {
			nextIsValue = false;
			continue;
		}
		if (arg.startsWith('--')) {
			read.long.push(arg);
			nextIsValue = !arg.includes('=') && valueLong.some((name) => isOption(arg, name));
		} else if (arg.startsWith('-') && arg.length > 1) {
			for (let index = 1; index < arg.length; index += 1) {
				const letter = arg[index] as string;
				if (valueShort.includes(letter)) {
					nextIsValue = index === arg.length - 1;
					break;
				}
				read.short.add(letter);
			}
		}
	}
	return read;
}

/**
 * `.`, `./.`, `src/..`, `:/`, `:(top)`, any glob, and the workspace root or a directory above it
 * spelled as an absolute path can reach the whole tree. A glob is not expanded here, so every glob
 * counts.
 */
function namesWholeTree(args: string[], root: string): boolean {
	const rootPath = resolve(root).toLowerCase();
	return args.some((arg) => {
		if (arg.startsWith('-')) return false;
		if (arg.startsWith(':') || /[*?[]/.test(arg)) return true;
		if (/^(?:[A-Za-z]:[\\/]|[\\/])/.test(arg)) {
			const target = resolve(normalizePosixDrivePath(arg, process.platform)).toLowerCase();
			return rootPath === target || rootPath.startsWith(target.replace(/[\\/]$/, '') + sep);
		}
		const normalized = posix.normalize(arg);
		return normalized === '.' || normalized === './' || normalized.startsWith('..');
	});
}

/** An interactive mode has no terminal here, so its answers can only come from a pipe. */
function readsAnswers(read: ReadOptions): boolean {
	return read.short.has('p') || hasOption(read.long, '--patch');
}

function resetDiscards(args: string[]): boolean {
	const options = optionWords(args);
	if (hasOption(options, '--hard', '--keep', '--merge')) return true;
	if (hasOption(options, '--soft')) return false;
	// A revision that walks back from a ref rewinds HEAD. Words after `--` are paths.
	return options.some((arg) => !arg.startsWith('-') && /[~^]|@\{/.test(arg));
}

function cleanDeletes(read: ReadOptions): boolean {
	if (read.short.has('i') || hasOption(read.long, '--interactive')) return true;
	const dryRun = read.long.includes('--dry-run') || read.short.has('n');
	if (dryRun && !hasOption(read.long, '--no-dry-run')) return false;
	return hasOption(read.long, '--force') || read.short.has('f');
}

function restoreDiscards(read: ReadOptions, args: string[], root: string): boolean {
	if (readsAnswers(read) || hasOption(read.long, '--pathspec-from-file')) return true;
	if (!namesWholeTree(args, root)) return false;
	const staged = hasOption(read.long, '--staged') || read.short.has('S');
	const worktree = hasOption(read.long, '--worktree') || read.short.has('W');
	// `--staged` alone only unstages; the working tree is untouched.
	return !staged || worktree;
}

export function isDestructive(subcommand: string, args: string[], root: string): boolean {
	const read = readOptions(subcommand, args);
	const forces = hasOption(read.long, '--force') || read.short.has('f');
	switch (subcommand) {
		case 'apply':
			return read.short.has('R') || hasOption(read.long, '--reverse');
		case 'checkout':
			return (
				forces ||
				readsAnswers(read) ||
				hasOption(read.long, '--pathspec-from-file') ||
				namesWholeTree(args, root)
			);
		case 'checkout-index':
			return forces || read.short.has('a') || hasOption(read.long, '--all');
		case 'clean':
			return cleanDeletes(read);
		case 'read-tree':
			return hasOption(read.long, '--reset') || read.short.has('u');
		case 'reset':
			return resetDiscards(args);
		case 'restore':
			return restoreDiscards(read, args, root);
		case 'rm':
			// `--cached` only unstages. Without it, a forced or recursive removal of the whole
			// tree deletes every edited file.
			if (hasOption(read.long, '--cached')) return false;
			return (forces || read.short.has('r')) && namesWholeTree(args, root);
		case 'switch':
			return forces || hasOption(read.long, '--discard-changes');
		default:
			return false;
	}
}

/** `archive` is judged by what its output is piped into, so it is recognised but not listed. */
export const JUDGED = new Set([
	'apply',
	'checkout',
	'checkout-index',
	'clean',
	'read-tree',
	'reset',
	'restore',
	'rm',
	'switch',
]);
