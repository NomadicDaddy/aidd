import process from 'node:process';

import { parseCrawlArgs } from './crawltest-config.ts';
import { runCrawltest } from './lib/crawltest/crawl.ts';

export { parseCrawlArgs };
export { runCrawltest };
export {
	assertLocalNetworkAccess,
	type LocalNetworkInterfaceAddress,
	type LocalNetworkProbeDependencies,
	selectLocalNetworkHost,
} from './lib/crawltest/local-network.ts';
export { isIgnorableConsoleError } from './lib/crawltest/page-assertions.ts';
export { defaultBugProjectId } from './lib/crawltest/projects.ts';

if (import.meta.main) {
	process.exit(await runCrawltest(parseCrawlArgs(Bun.argv.slice(2))));
}
