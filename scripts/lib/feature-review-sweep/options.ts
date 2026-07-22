import process from 'node:process';

import { SUPPORTED_DEPTH, SUPPORTED_FIX_MODE } from './constants.ts';
import { type SweepOptions } from './types.ts';

function printHelp(): void {
	console.log(`feature-review-sweep.ts

Usage:
  bun ./scripts/feature-review-sweep.ts [--apps <csv>] [--dry-run] [--report-only]
      [--depth ${SUPPORTED_DEPTH}] [--fix-mode ${SUPPORTED_FIX_MODE}]
`);
}

export function parseSweepArgs(argv: string[]): SweepOptions {
	const options: SweepOptions = {
		apps: null,
		depth: SUPPORTED_DEPTH,
		dryRun: false,
		fixMode: SUPPORTED_FIX_MODE,
		reportOnly: false,
	};

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === '--apps') {
			options.apps = new Set(
				String(argv[index + 1] ?? '')
					.split(',')
					.map((value) => value.trim())
					.filter(Boolean)
			);
			index += 1;
			continue;
		}
		if (arg === '--dry-run') {
			options.dryRun = true;
			continue;
		}
		if (arg === '--report-only') {
			options.reportOnly = true;
			continue;
		}
		if (arg === '--depth') {
			options.depth = argv[index + 1] ?? '';
			index += 1;
			continue;
		}
		if (arg === '--fix-mode') {
			options.fixMode = argv[index + 1] ?? '';
			index += 1;
			continue;
		}
		if (arg === '--help' || arg === '-h') {
			printHelp();
			process.exit(0);
		}
		throw new Error(`Unknown argument: ${arg}`);
	}

	if (options.depth !== SUPPORTED_DEPTH) {
		throw new Error(
			`Unsupported --depth "${options.depth}". Supported value: ${SUPPORTED_DEPTH}`
		);
	}

	if (options.fixMode !== SUPPORTED_FIX_MODE) {
		throw new Error(
			`Unsupported --fix-mode "${options.fixMode}". Supported value: ${SUPPORTED_FIX_MODE}`
		);
	}

	return options;
}

export function resolveMode(options: SweepOptions): string {
	if (options.dryRun) return 'dry-run';
	if (options.reportOnly) return 'report-only';
	return 'apply';
}
