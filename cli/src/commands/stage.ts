import { parseArgs, type ParsedArgs } from 'aidd-shared/args/index';
import { resolveConfig, type ResolvedConfig } from 'aidd-shared/config';
import { metadataPath } from 'aidd-shared/metadata/paths';
import { resolveRootDir } from 'aidd-shared/runtime';
import { readdir } from 'node:fs/promises';

import { ensureMetadata } from '../metadata/init.ts';
import { scaffoldOptionsFor, scaffoldProjectAssets } from '../metadata/scaffold.ts';
import { resolveRunPlan } from '../plan/resolve.ts';
import { assertProjectForRun } from '../preflight.ts';
import { prepareSkillRun } from '../skill-run.ts';

const USAGE = `Usage: aidd stage --project-dir <dir> [--skill <id>]

Copy aidd's contract files into the project's .aidd/ exactly as the start of a run would (shared
modules, and with --skill, that skill's declared references and sibling contracts), then exit.
No agent is launched, no feature is claimed, and no git hooks or config are changed. Use it before
working through a skill by hand, so the staged references the skill reads are present.

Exit codes: 0 staged, 1 staging failed, 2 usage error.`;

interface StageOptions {
	projectDir: string;
	skillId?: string;
}

function parseStageArgs(argv: string[]): number | StageOptions {
	let projectDir: string | undefined;
	let skillId: string | undefined;
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === '--help' || arg === '-h') {
			console.log(USAGE);
			return 0;
		}
		const value = argv[i + 1];
		if ((arg === '--project-dir' || arg === '--skill') && value !== undefined) {
			if (arg === '--project-dir') projectDir = value;
			else skillId = value;
			i++;
			continue;
		}
		console.error(`Unexpected argument for aidd stage: ${arg ?? ''}`);
		console.error(USAGE);
		return 2;
	}
	if (projectDir === undefined) {
		console.error('aidd stage needs --project-dir <dir>');
		console.error(USAGE);
		return 2;
	}
	return skillId === undefined ? { projectDir } : { projectDir, skillId };
}

async function stagedEntries(projectDir: string): Promise<string[]> {
	const entries = await readdir(metadataPath(projectDir), { withFileTypes: true });
	const names: string[] = [];
	for (const entry of entries) {
		if (entry.isDirectory()) names.push(`${entry.name}/`);
	}
	return names.sort();
}

/** `aidd stage`. Returns the process exit code. */
export async function runStageCommand(
	argv: string[],
	rootDir: string = resolveRootDir(import.meta.url, 3),
	loadConfig: (args: ParsedArgs) => Promise<ResolvedConfig> = (args) =>
		resolveConfig(args, { baseDir: rootDir }),
): Promise<number> {
	const options = parseStageArgs(argv);
	if (typeof options === 'number') return options;
	const runArgv = ['--project-dir', options.projectDir];
	if (options.skillId !== undefined) runArgv.push('--skill', options.skillId);
	const args = parseArgs(runArgv);
	try {
		await assertProjectForRun(args);
		const config = await loadConfig(args);
		const prepared = await prepareSkillRun(args, config, rootDir);
		const plan = resolveRunPlan(args, config);
		// No rootDir: a run installs the history guard here, which writes git config. Staging only
		// creates the metadata directories and copies what a run would copy.
		await ensureMetadata(plan.projectDir, undefined, plan.writeAllowlist);
		await scaffoldProjectAssets(plan, rootDir, scaffoldOptionsFor(config, prepared?.contracts));
		const staged = await stagedEntries(plan.projectDir);
		console.log(`Staged into ${metadataPath(plan.projectDir)}: ${staged.join(', ')}`);
		return 0;
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		console.error(`aidd stage failed: ${message}`);
		return 1;
	}
}
