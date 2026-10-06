import { describe, expect, test } from 'bun:test';
import { defaults, defaultWebConfig, resolveMergedConfig } from 'aidd-shared/config';

// audit-techdebt-1790882994: the web default block existed as three literals, two never read in
// production, so a changed default could silently diverge. One object now serves both readers.
describe('web config defaults', () => {
	test('defaults.web is the same object resolveWebConfig reads', () => {
		expect(defaults.web).toBe(defaultWebConfig);
	});

	test('a resolved config always carries a web block, so no fallback literal is needed', () => {
		const resolved = resolveMergedConfig({}, { baseDir: 'D:/applications/aidd' });
		expect(resolved.web.port).toBe(defaultWebConfig.port);
		expect(resolved.web.hostname).toBe(defaultWebConfig.hostname);
		expect(resolved.web.maxConcurrentRuns).toBe(defaultWebConfig.maxConcurrentRuns);
	});
});
