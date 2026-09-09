import { aggregate, renderReport } from './lib/benchmark/aggregate.ts';
import { buildAiddInvocation, splitCommandLine } from './lib/benchmark/cli.ts';
import { evaluateTask } from './lib/benchmark/evaluation.ts';
import { loadManifest } from './lib/benchmark/manifest.ts';
import { parseBenchmarkMetrics } from './lib/benchmark/metrics.ts';
import { estimateCostFromTokens, pricingForStack, resolveCost } from './lib/benchmark/pricing.ts';
import { regradeRuns } from './lib/benchmark/results.ts';
import { main, preflightReady } from './lib/benchmark/run.ts';

export {
	aggregate,
	buildAiddInvocation,
	estimateCostFromTokens,
	evaluateTask,
	loadManifest,
	parseBenchmarkMetrics,
	preflightReady,
	pricingForStack,
	regradeRuns,
	renderReport,
	resolveCost,
	splitCommandLine,
};

export type {
	BenchmarkArtifacts,
	BenchmarkManifest,
	BenchmarkRun,
	BenchmarkTask,
} from './lib/benchmark/types.ts';

if (import.meta.main) {
	try {
		main();
	} catch (err) {
		console.error(err instanceof Error ? err.message : String(err));
		process.exit(1);
	}
}
