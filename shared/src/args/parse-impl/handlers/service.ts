import { type ParseContext, type ParsedArgs } from '../types.ts';

export function applyServiceFlags(
	flag: string,
	args: ParsedArgs,
	i: number,
	ctx: ParseContext,
): null | number {
	switch (flag) {
		case '--config-matrix':
			args.configMatrix = true;
			return i + 1;
		case '--director':
			args.directorMode = true;
			return i + 1;
		case '--director-context':
			args.directorContextPath = ctx.requireValue(i, flag);
			return i + 2;
		case '--director-output':
			args.directorOutputPath = ctx.requireValue(i, flag);
			return i + 2;
		case '--fleet-summary':
			args.fleetSummaryPath = ctx.requireValue(i, flag);
			return i + 2;
		case '--help':
		case '-h':
			args.help = true;
			return i + 1;
		case '--interview': {
			args.interviewMode = true;
			const next = ctx.argv[i + 1];
			if (next !== undefined && !next.startsWith('--')) {
				args.interviewFile = next;
				return i + 2;
			}
			return i + 1;
		}
		case '--mcp':
			args.mcpMode = true;
			return i + 1;
		case '--port':
			args.webPort = ctx.parseNumber(i, flag);
			return i + 2;
		case '--suggestion-schema':
			args.suggestionSchemaPath = ctx.requireValue(i, flag);
			return i + 2;
		case '--version':
			args.version = true;
			return i + 1;
		case '--web':
			args.webMode = true;
			return i + 1;
		default:
			return null;
	}
}
