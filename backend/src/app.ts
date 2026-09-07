import { ArgsError, parseArgs } from 'aidd-shared/args/index';
import { resolveConfig } from 'aidd-shared/config';
import { readAiddVersion } from 'aidd-shared/run-provenance';
import { resolveRootDir } from 'aidd-shared/runtime';

import { startWebServer } from './start.ts';

const rootDir = resolveRootDir(import.meta.url, 2);

function printWebHelp(): void {
	console.log(`aidd-web

Usage: aidd-web [OPTIONS]

Options:
  --port N           port to bind the local control panel (default from config)
  --help, -h         show this help and exit
  --version          print the aidd version and exit

The control panel reads sibling asset directories (audits/, skills/,
scaffolding/, prompts/, recipes/, frontend/dist/) and writes runtime state to
data/ under the source checkout.`);
}

export async function runBackend(argv: string[]): Promise<number> {
	try {
		const args = parseArgs(argv.includes('--web') ? argv : ['--web', ...argv]);
		if (args.help) {
			printWebHelp();
			return 0;
		}
		if (args.version) {
			console.log(`aidd-web v${(await readAiddVersion(rootDir)) ?? 'unknown'}`);
			return 0;
		}
		const config = await resolveConfig(args, { baseDir: rootDir });
		return await startWebServer(config, { rootDir });
	} catch (err) {
		if (err instanceof ArgsError) {
			console.error(`Error: ${err.message}`);
			return 2;
		}
		const message = err instanceof Error ? err.message : String(err);
		console.error(`Error: ${message}`);
		return 1;
	}
}

if (import.meta.main) {
	process.exit(await runBackend(process.argv.slice(2)));
}
