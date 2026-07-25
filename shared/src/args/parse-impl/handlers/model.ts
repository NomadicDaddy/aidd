import { type ParseContext, type ParsedArgs } from '../types.ts';

export function applyModelFlags(
	flag: string,
	args: ParsedArgs,
	i: number,
	ctx: ParseContext,
): null | number {
	switch (flag) {
		case '--audit-model':
			args.auditModel = ctx.requireValue(i, flag);
			return i + 2;
		case '--cli':
			args.cli = ctx.parseBackend(ctx.requireValue(i, flag));
			return i + 2;
		case '--code-model':
			args.codeModel = ctx.requireValue(i, flag);
			return i + 2;
		case '--exec-cli':
			args.execCli = ctx.parseBackend(ctx.requireValue(i, flag));
			return i + 2;
		case '--exec-model':
			args.execModel = ctx.requireValue(i, flag);
			return i + 2;
		case '--init-model':
			args.initModel = ctx.requireValue(i, flag);
			return i + 2;
		case '--model':
			args.model = ctx.requireValue(i, flag);
			return i + 2;
		case '--no-thinking':
			args.thinking = false;
			return i + 1;
		case '--overseer-cli':
			args.overseerCli = ctx.parseBackend(ctx.requireValue(i, flag));
			return i + 2;
		case '--overseer-model':
			args.overseerModel = ctx.requireValue(i, flag);
			return i + 2;
		case '--reasoning-effort':
			args.reasoningEffort = ctx.parseReasoningEffort(ctx.requireValue(i, flag));
			return i + 2;
		case '--secondary-cli':
			args.secondaryCli = ctx.parseBackend(ctx.requireValue(i, flag));
			return i + 2;
		case '--secondary-model':
			args.secondaryModel = ctx.requireValue(i, flag);
			return i + 2;
		case '--thinking':
			args.thinking = true;
			return i + 1;
		case '--thinking-level':
			args.thinkingLevel = ctx.parseThinkingLevel(ctx.requireValue(i, flag));
			return i + 2;
		case '--triumvirate':
			args.triumvirateMode = true;
			return i + 1;
		default:
			return null;
	}
}
