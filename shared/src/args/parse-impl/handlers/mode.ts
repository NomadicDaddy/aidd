import { type ParseContext, type ParsedArgs } from '../types.ts';

export function applyModeFlags(
	flag: string,
	args: ParsedArgs,
	i: number,
	ctx: ParseContext
): null | number {
	switch (flag) {
		case '--check-artifacts':
			args.checkArtifacts = true;
			return i + 1;
		case '--check-features':
			args.checkFeatures = true;
			return i + 1;
		case '--directive':
			args.directiveMode = true;
			return i + 1;
		case '--directive-readonly':
			args.directiveReadonly = true;
			return i + 1;
		case '--extract-batch':
			args.extractBatch = true;
			return i + 1;
		case '--extract-structured':
			args.extractStructured = true;
			return i + 1;
		case '--in-progress':
			args.inProgressMode = true;
			return i + 1;
		case '--no-stop-when-done':
			args.stopWhenDone = false;
			return i + 1;
		case '--prompt':
			args.customPrompt = ctx.requireValue(i, flag);
			return i + 2;
		case '--skill':
			args.skillId = ctx.requireValue(i, flag);
			return i + 2;
		case '--skill-args':
			args.skillArgs = ctx.requireValue(i, flag);
			return i + 2;
		case '--stop':
			args.stopSignal = true;
			return i + 1;
		case '--stop-when-done':
			args.stopWhenDone = true;
			return i + 1;
		case '--todo':
			args.todoMode = true;
			return i + 1;
		case '--validate':
			args.validateMode = true;
			return i + 1;
		default:
			return null;
	}
}
