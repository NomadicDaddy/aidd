import type { ParsedArgs } from './parse.ts';

import { validFilterFields } from './constants.ts';

export class ArgsError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ArgsError';
	}
}

export function validateParsedArgs(args: ParsedArgs): void {
	if (args.skillId && args.customPrompt) {
		throw new ArgsError('--skill cannot be combined with --prompt');
	}
	if (args.skillArgs && !args.skillId) {
		throw new ArgsError('--skill-args requires --skill <id>');
	}
	if (args.skillIntent && !args.skillId) {
		throw new ArgsError('--skill-intent requires --skill <id>');
	}
	// Both spellings reach the same read-only flag, so a run asking for writes while also asking
	// for read-only is a contradiction the operator has to resolve. Picking a winner silently is
	// how a skill run ends up with the opposite of the permission its launcher believed it sent.
	if (args.skillIntent === 'apply-changes' && args.directiveReadonly) {
		throw new ArgsError(
			'--skill-intent apply-changes cannot be combined with --directive-readonly',
		);
	}
	// A blank directive body compiles to a prompt with neither the mutation nor the
	// read-only wrapper — the agent would launch with guardrails and a result contract
	// but no task and no permission framing. Reject it before a plan is ever resolved.
	// Skill runs are exempt from the bodyless --directive rule: they launch as
	// `--directive --skill <id>` and the CLI compiles the skill into customPrompt later
	// (prepareSkillRun), after parsing but before plan resolution.
	if (args.customPrompt !== undefined && args.customPrompt.trim() === '') {
		throw new ArgsError('--prompt requires a non-empty directive');
	}
	if (args.directiveMode && args.customPrompt === undefined && !args.skillId) {
		throw new ArgsError('--directive requires --prompt "<directive>" or --skill <id>');
	}
	if (args.filterBy && !args.filterValue) {
		throw new ArgsError('--filter-by requires --filter <value>');
	}
	if (!args.filterBy && args.filterValue) {
		throw new ArgsError('--filter requires --filter-by <field>');
	}
	if (args.filterBy && !validFilterFields.has(args.filterBy)) {
		throw new ArgsError(`Invalid --filter-by field: '${args.filterBy}'`);
	}
	if (args.webPort !== undefined && (args.webPort < 1 || args.webPort > 65535)) {
		throw new ArgsError('--port must be between 1 and 65535');
	}
	if (args.thinking === false && args.thinkingLevel !== undefined) {
		throw new ArgsError('--no-thinking cannot be combined with --thinking-level');
	}
	if (args.triumvirateMode) {
		if (args.webMode) throw new ArgsError('--triumvirate cannot be combined with --web');
		if (args.directorMode)
			throw new ArgsError('--triumvirate cannot be combined with --director');
		if (args.interviewMode)
			throw new ArgsError('--triumvirate cannot be combined with --interview');
		if (args.checkFeatures)
			throw new ArgsError('--triumvirate cannot be combined with --check-features');
		if (args.checkArtifacts)
			throw new ArgsError('--triumvirate cannot be combined with --check-artifacts');
	}
}
