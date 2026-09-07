#!/usr/bin/env bun
import { cwd, exit } from 'node:process';

import { runAuditEvalBenchmark } from './lib/audit-eval/bench.ts';

if (import.meta.main) {
	exit(await runAuditEvalBenchmark(cwd(), Bun.argv.slice(2)));
}
