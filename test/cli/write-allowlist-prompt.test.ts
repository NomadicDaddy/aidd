import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { parseArgs } from 'aidd-shared/args/index';
import { defaultWebConfig, type ResolvedConfig } from 'aidd-shared/config';

import { IterationPromptContext } from '../../cli/src/orchestrator/run/prompt-context.ts';
import { resolveRunPlan } from '../../cli/src/plan/resolve.ts';
import { testTempDir } from '../_helpers/temp.ts';

// Review Application Logs, 2026-10-22 (run_1792670580176): only the retry prompt named the allowed
// paths, so an allowlisted run in a shared checkout learned the limit by breaking it, and with no
// revert and no retry there, that first write failed the run with exit 76.

const rootDir = join(import.meta.dir, '..', '..');
const config: ResolvedConfig = {
	cli: 'native',
	dirtyTreeThreshold: 50,
	idleNudgeTimeoutSeconds: 600,
	idleTimeoutSeconds: 900,
	maxConsecutiveTimeoutRetries: 2,
	maxIterations: 10,
	noClean: false,
	noWorkBackoffMs: 30_000,
	preflightDoctor: false,
	quitOnAbort: 0,
	rateLimitBackoffSeconds: 300,
	rateLimitBufferSeconds: 60,
	reasoningEffort: 'low',
	timeoutSeconds: 3600,
	web: defaultWebConfig,
};

async function compileFor(extraArgs: string[]): Promise<string> {
	const projectDir = await testTempDir('write-allowlist-prompt');
	const plan = resolveRunPlan(
		parseArgs(['--project-dir', projectDir, '--cli', 'native', ...extraArgs]),
		config,
	);
	const context = new IterationPromptContext(projectDir, rootDir, undefined, plan.writeAllowlist);
	return (await context.compile(plan.prompt)).text;
}

describe('write allowlist in the first prompt', () => {
	test('an allowlisted run is told its writable paths before it writes', async () => {
		const text = await compileFor(['--write-allowlist', './.aidd/,docs\\notes']);
		expect(text).toContain('## Write allowlist');
		expect(text).toContain('- `.aidd/`');
		expect(text).toContain('- `docs/notes/`');
		expect(text).toContain('overrides any instruction in this prompt');
		expect(text).not.toContain('WRITE ALLOWLIST RETRY');
	});

	test('a run with no allowlist gets no such section', async () => {
		expect(await compileFor([])).not.toContain('## Write allowlist');
	});
});
