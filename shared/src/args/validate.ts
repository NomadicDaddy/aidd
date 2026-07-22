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
