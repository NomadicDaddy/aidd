import { type ParseContext, type ParsedArgs } from '../types.ts';

export function applyRunFlags(
	flag: string,
	args: ParsedArgs,
	i: number,
	ctx: ParseContext
): null | number {
	switch (flag) {
		case '--continue-on-timeout':
			args.continueOnTimeout = true;
			return i + 1;
		case '--dirty-tree-threshold':
			args.dirtyTreeThreshold = ctx.parseNumber(i, flag);
			return i + 2;
		case '--idle-nudge-timeout':
			args.idleNudgeTimeoutSeconds = ctx.parseNumber(i, flag);
			return i + 2;
		case '--idle-timeout':
			args.idleTimeoutSeconds = ctx.parseNumber(i, flag);
			return i + 2;
		case '--max-cost-usd':
			args.maxCostUsd = ctx.parseDecimal(i, flag);
			return i + 2;
		case '--max-iterations':
			args.maxIterations = ctx.parseNumber(i, flag);
			return i + 2;
		case '--max-tokens':
			args.maxTokens = ctx.parseNumber(i, flag);
			return i + 2;
		case '--no-clean':
			args.noClean = true;
			return i + 1;
		case '--no-continue-on-timeout':
			args.continueOnTimeout = false;
			return i + 1;
		case '--no-work-backoff-ms':
			args.noWorkBackoffMs = ctx.parseNumber(i, flag);
			return i + 2;
		case '--project-dir':
			args.projectDir = ctx.requireValue(i, flag);
			return i + 2;
		case '--quit-on-abort':
			args.quitOnAbort = ctx.parseNumber(i, flag);
			return i + 2;
		case '--spec':
			args.specFile = ctx.requireValue(i, flag);
			return i + 2;
		case '--stop-before-implementation':
			args.stopBeforeImplementation = true;
			return i + 1;
		case '--timeout':
			args.timeoutSeconds = ctx.parseNumber(i, flag);
			return i + 2;
		default:
			return null;
	}
}
