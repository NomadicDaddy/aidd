import { aggregate, renderReport } from './lib/benchmark/aggregate.ts';
import { buildAiddInvocation, parseBenchmarkArgs, splitCommandLine } from './lib/benchmark/cli.ts';
import { evaluateTask } from './lib/benchmark/evaluation.ts';
import { loadManifest } from './lib/benchmark/manifest.ts';
import { buildRunMatrix } from './lib/benchmark/matrix.ts';
import { parseBenchmarkMetrics } from './lib/benchmark/metrics.ts';
import { estimateCostFromTokens, pricingForStack, resolveCost } from './lib/benchmark/pricing.ts';
import { regradeRuns } from './lib/benchmark/results.ts';
import { main, preflightReady } from './lib/benchmark/run.ts';

export {
	aggregate,
	buildAiddInvocation,
	buildRunMatrix,
	estimateCostFromTokens,
	evaluateTask,
	loadManifest,
	parseBenchmarkArgs,
	parseBenchmarkMetrics,
	pricingForStack,
	preflightReady,
	regradeRuns,
	renderReport,
	resolveCost,
	splitCommandLine,
};

export type { ResolvedModelPricing } from './lib/benchmark/pricing.ts';

export type {
	BenchmarkArgs,
	BenchmarkArtifacts,
	BenchmarkBackendName,
	BenchmarkCohort,
	BenchmarkManifest,
	BenchmarkModelPricing,
	BenchmarkPreflight,
	BenchmarkRun,
	BenchmarkScoring,
	BenchmarkSettings,
	BenchmarkStack,
	BenchmarkTask,
	CommandResult,
	EvaluationResult,
	ParsedMetrics,
	RunStatus,
	TokenUsage,
} from './lib/benchmark/types.ts';

if (import.meta.main) {
	try {
		main();
	} catch (err) {
		console.error(err instanceof Error ? err.message : String(err));
		process.exit(1);
	}
}
