import type { ParsedArgs } from 'aidd-shared/args/index';

import { resolveConfig, type ResolvedConfig } from 'aidd-shared/config';
import {
	decideRestedBackend,
	DEFAULT_PROVIDER_REST_SUBSTITUTES,
} from 'aidd-shared/provider-rest/decide';
import { readProviderRests } from 'aidd-shared/provider-rest/store';

export type CliRestOutcome = { config: ResolvedConfig } | { exitCode: number };

/** Flags that read or report and never start an agent, so a rest has nothing to withhold. */
function startsAgent(args: ParsedArgs): boolean {
	return !(
		args.checkArtifacts ||
		args.checkFeatures ||
		args.extractBatch ||
		args.extractStructured ||
		args.stopSignal
	);
}

/**
 * Provider rest for a direct CLI run, decided before the plan exists. `--cli` is the person's pick
 * for this run, so a resting one refuses with exit 2 and says how to go elsewhere. With no `--cli`,
 * the configured default is resting and the run moves to the first substitute exactly as if the
 * person had typed `--cli <substitute>`: `--model` and `--reasoning-effort` were meant for the
 * resting backend and are dropped. `args` is updated in place to match the config returned.
 *
 * The web panel decides rest before it spawns the CLI and passes `--ignore-rest`, so a web launch
 * is never refused here for a backend the panel already settled on.
 */
export async function applyProviderRest(
	args: ParsedArgs,
	config: ResolvedConfig,
	baseDir: string,
	reresolve: (next: ParsedArgs) => Promise<ResolvedConfig> = (next) =>
		resolveConfig(next, { baseDir }),
): Promise<CliRestOutcome> {
	if (args.ignoreRest || !startsAgent(args)) return { config };
	const now = new Date();
	const decision = decideRestedBackend({
		ignoreRest: false,
		now,
		personPicked: args.cli !== undefined,
		requested: config.cli,
		rests: await readProviderRests(config.web.dataDir, now),
		substitutes: config.providerRestSubstitutes ?? DEFAULT_PROVIDER_REST_SUBSTITUTES,
	});
	if (decision.kind === 'refuse') {
		const elsewhere =
			decision.alternative === undefined
				? ''
				: ` Use --cli ${decision.alternative} instead, or`;
		console.error(`Error: ${decision.message}.${elsewhere} pass --ignore-rest to run anyway.`);
		return { exitCode: 2 };
	}
	if (decision.substitution === undefined) return { config };
	console.log(`Provider rest: ${decision.substitution.note}`);
	args.cli = decision.backend;
	delete args.model;
	delete args.reasoningEffort;
	return { config: await reresolve(args) };
}
