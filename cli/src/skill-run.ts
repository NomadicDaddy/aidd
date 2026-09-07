import type { ParsedArgs } from 'aidd-shared/args/index';
import type { ResolvedConfig } from 'aidd-shared/config';
import type { AiddRunDriver } from 'aidd-shared/run-provenance';
import type { SkillRootPaths } from 'aidd-shared/skills/catalog';

import { compileSkillDirective, readSkillDefinition } from 'aidd-shared/skills/catalog';
import { dirname } from 'node:path';

import { skillContractDeps, type SkillContractDeps } from './metadata/scaffoldSkillContracts.ts';

export interface PreparedSkillRun {
	contracts: SkillContractDeps | undefined;
	driver: AiddRunDriver;
}

// The roots a skill body may name, as they are on this machine. Only the aidd installation is
// always known; the others come from config and stay undefined when unconfigured, which
// compileSkillDirective reports rather than papering over.
function skillRootPaths(config: ResolvedConfig, rootDir: string): SkillRootPaths {
	// spernakitRoot = parent of the configured init script, the sole spernakit marker.
	const spernakit = config.web?.spernakitInitScript;
	return {
		aidd: rootDir,
		...(config.applicationsRoot ? { applications: config.applicationsRoot } : {}),
		...(config.projectDir ? { project: config.projectDir } : {}),
		...(spernakit ? { spernakit: dirname(spernakit) } : {}),
	};
}

/**
 * Compile the invoked skill into the run's custom prompt and report the contract dependencies to
 * stage. Returns undefined when the run is not a skill run, or when the skill declares nothing to
 * stage. Assigns `args.customPrompt` because the skill directive *is* the run's prompt.
 */
export async function prepareSkillRun(
	args: ParsedArgs,
	config: ResolvedConfig,
	rootDir: string,
): Promise<PreparedSkillRun | undefined> {
	if (!args.skillId) return undefined;
	const skill = await readSkillDefinition(rootDir, args.skillId, config.web?.dataDir);
	const directive = compileSkillDirective(
		skill,
		args.skillArgs ?? '',
		skillRootPaths(config, rootDir),
	);
	// A blank compiled directive would launch an agent with no task and no permission
	// wrapper — the same hole validateParsedArgs closes for CLI-supplied prompts.
	if (directive.trim() === '') {
		throw new Error(`skill '${args.skillId}' compiled to an empty directive`);
	}
	args.customPrompt = directive;
	// The invoked skill's declared contract dependencies are staged into the project's `.aidd/` so a
	// sandboxed agent can read them locally instead of reaching for a path outside the project.
	return {
		contracts: skillContractDeps(skill),
		driver: {
			driverId: skill.id,
			driverKind: 'skill',
			driverSha256: skill.definitionSha256,
		},
	};
}
