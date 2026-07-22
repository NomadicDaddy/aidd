import { numberFlags } from './constants.ts';
import {
	applyAuditFlags,
	applyModeFlags,
	applyModelFlags,
	applyRunFlags,
	applyServiceFlags,
} from './parse-impl/handlers.ts';
import {
	createParseDecimal,
	createParseNumber,
	createRequireValue,
	expandInlineValues,
	parseBackend,
	parseList,
	parseReasoningEffort,
	parseThinkingLevel,
} from './parse-impl/helpers.ts';
import { createDefaultParsedArgs, type ParseContext, type ParsedArgs } from './parse-impl/types.ts';
import { ArgsError, validateParsedArgs } from './validate.ts';

export { type ParsedArgs } from './parse-impl/types.ts';

const flagGroups = [
	applyModelFlags,
	applyRunFlags,
	applyModeFlags,
	applyAuditFlags,
	applyServiceFlags,
];

export function parseArgs(argv: string[]): ParsedArgs {
	const { argv: expandedArgv, inlineValueIndices } = expandInlineValues(argv);
	const requireValue = createRequireValue(expandedArgv, inlineValueIndices);
	const parseNumber = createParseNumber(requireValue);
	const parseDecimal = createParseDecimal(requireValue);

	const ctx: ParseContext = {
		argv: expandedArgv,
		parseBackend,
		parseDecimal,
		parseList,
		parseNumber,
		parseReasoningEffort,
		parseThinkingLevel,
		requireValue,
	};

	const args = createDefaultParsedArgs();

	for (let i = 0; i < expandedArgv.length;) {
		const flag = expandedArgv[i];
		if (flag === undefined) break;

		let next: null | number = null;
		for (const handle of flagGroups) {
			next = handle(flag, args, i, ctx);
			if (next !== null) break;
		}
		if (next === null) {
			if (numberFlags.has(flag)) {
				throw new ArgsError(`${flag} requires a value`);
			}
			throw new ArgsError(`Unknown option: ${flag}`);
		}
		i = next;
	}

	validateParsedArgs(args);
	return args;
}
