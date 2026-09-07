import { degitClone, parseGithubTemplateSource } from 'aidd-shared/git/degit';
import { removeTempTree } from 'aidd-shared/lib/remove-temp-tree';
import { readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

// Same restriction the web create flow enforces (backend/src/services/project/create.ts).
const NAME_PATTERN = /^[A-Za-z0-9._-]+$/;
const OUTPUT_TAIL_BYTES = 2048;

export interface NewCommandDeps {
	clone?: typeof degitClone;
}

function printUsage(): void {
	console.log(`Usage: aidd new <github-url | owner/repo[#ref]> [--name NAME] [--root DIR]

Create a project from a GitHub template repository with degit semantics:
shallow clone, stripped history, fresh git init with the imported baseline committed.

Options:
  --name NAME   project folder name (default: the template repo name)
  --root DIR    directory to create the project in (default: current directory)
  -h, --help    show this help
`);
}

function tail(value: string): string {
	const trimmed = value.trim();
	if (trimmed.length <= OUTPUT_TAIL_BYTES) return trimmed;
	return `…${trimmed.slice(-OUTPUT_TAIL_BYTES)}`;
}

async function directoryIsAvailable(targetPath: string): Promise<null | string> {
	let entries: string[];
	try {
		entries = await readdir(targetPath);
	} catch {
		return null; // Missing directory: available.
	}
	if (entries.length > 0) return `Destination already exists and is not empty: ${targetPath}`;
	try {
		await readdir(join(targetPath, '.aidd'));
		return `Destination already contains .aidd metadata: ${targetPath}`;
	} catch {
		return null;
	}
}

// `aidd new` — standalone project bootstrap from a GitHub template. Deliberately does not
// launch the project-intake pipeline (that is web-backend machinery); it clones, re-inits
// git, and points the user at the follow-ups.
export async function runNewCommand(argv: string[], deps: NewCommandDeps = {}): Promise<number> {
	let source: null | string = null;
	let name: null | string = null;
	let root = process.cwd();

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i] ?? '';
		if (arg === '--help' || arg === '-h') {
			printUsage();
			return 0;
		}
		if (arg === '--name' || arg === '--root') {
			const value = argv[i + 1];
			if (value === undefined || value.startsWith('--')) {
				console.error(`Missing value for ${arg}`);
				return 2;
			}
			if (arg === '--name') name = value;
			else root = value;
			i++;
			continue;
		}
		if (arg.startsWith('-')) {
			console.error(`Unknown option for aidd new: ${arg}`);
			printUsage();
			return 2;
		}
		if (source !== null) {
			console.error(`Unexpected extra argument: ${arg}`);
			printUsage();
			return 2;
		}
		source = arg;
	}

	if (source === null) {
		console.error('Missing template source.');
		printUsage();
		return 2;
	}
	const parsed = parseGithubTemplateSource(source);
	if (parsed === null) {
		console.error(
			`Not a GitHub template source: ${source}\n` +
				'Expected https://github.com/owner/repo, github.com/owner/repo, or owner/repo, with an optional #ref.',
		);
		return 2;
	}

	const projectName = name ?? parsed.repo;
	if (!NAME_PATTERN.test(projectName) || projectName === '.' || projectName === '..') {
		console.error(
			`Project name must contain only letters, numbers, dashes, underscores, or periods: ${projectName}`,
		);
		return 2;
	}

	const targetPath = resolve(root, projectName);
	const conflict = await directoryIsAvailable(targetPath);
	if (conflict !== null) {
		console.error(conflict);
		return 1;
	}

	console.log(`Cloning ${parsed.owner}/${parsed.repo}${parsed.ref ? `#${parsed.ref}` : ''} …`);
	const clone = deps.clone ?? degitClone;
	const outcome = await clone({
		baselineLabel: parsed.repo,
		cloneUrl: parsed.cloneUrl,
		ref: parsed.ref,
		targetPath,
	});
	if (outcome.code !== 0) {
		console.error(`Clone failed with exit code ${outcome.code}.`);
		if (outcome.stderr.trim()) console.error(tail(outcome.stderr));
		if (outcome.stdout.trim()) console.error(tail(outcome.stdout));
		// The command created the directory, so a failed clone cleans it up rather than
		// leaving a partial tree behind. Best-effort: the failure above is what matters.
		try {
			await removeTempTree(targetPath);
		} catch {
			console.error(`Could not remove partial clone at ${targetPath}`);
		}
		return 1;
	}

	console.log(`Created ${targetPath} from ${parsed.owner}/${parsed.repo} (fresh git history rooted at the imported baseline).

Next steps:
  aidd --project-dir ${targetPath}     start an aidd run (onboarding is detected automatically)
  or open the web UI and run project-intake to build the .aidd backlog.`);
	return 0;
}
