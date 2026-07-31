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
	resolveSkillIntent(args);
	return args;
}

/**
 * Turn a skill run's declared execution intent into the read-only flag the directive compiler
 * reads. Every other skill entry point rejects a run that fails to declare one: a recipe step is
 * refused at normalization and again at dispatch, and the web one-shot route 400s. The CLI cannot
 * refuse a bare `--skill` without breaking the documented command line, so it resolves the missing
 * declaration to the safe end of the contract instead of inheriting the writable default that
 * `--prompt` gets. Skill bodies are written write-intentional — `spirit` instructs the agent to fix
 * what it finds — so a bare `aidd --skill spirit` used to edit the tree with nothing having asked
 * it to. `--directive-readonly` keeps working on its own; the validator rejects it alongside an
 * explicit `apply-changes` rather than silently picking a winner.
 */
function resolveSkillIntent(args: ParsedArgs): void {
	if (!args.skillId) return;
	if (args.skillIntent !== 'apply-changes') args.directiveReadonly = true;
}
