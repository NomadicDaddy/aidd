import type { ParsedArgs } from 'aidd-shared/args/index';

import { parseArgs } from 'aidd-shared/args/index';
import { defaultWebConfig, type ResolvedConfig } from 'aidd-shared/config';
import { writeProviderRest } from 'aidd-shared/provider-rest/store';
import { describe, expect, test } from 'bun:test';

import { parseRestUntil } from '../../cli/src/commands/rest.ts';
import { applyProviderRest } from '../../cli/src/provider-rest.ts';
import { testTempDir } from '../_helpers/temp.ts';

async function restingConfig(cli: ResolvedConfig['cli']): Promise<ResolvedConfig> {
	const dataDir = await testTempDir('cli-provider-rest-');
	const now = Date.now();
	await writeProviderRest(dataDir, {
		backend: 'claude-code',
		reason: 'quota',
		source: 'manual',
		setAt: new Date(now).toISOString(),
		until: new Date(now + 30 * 60_000).toISOString(),
	});
	return {
		cli,
		dirtyTreeThreshold: 50,
		idleNudgeTimeoutSeconds: 600,
		idleTimeoutSeconds: 900,
		maxConsecutiveTimeoutRetries: 2,
		maxIterations: null,
		noClean: false,
		noWorkBackoffMs: 30_000,
		quitOnAbort: 0,
		rateLimitBackoffSeconds: 300,
		rateLimitBufferSeconds: 60,
		reasoningEffort: 'low',
		timeoutSeconds: 3600,
		web: { ...defaultWebConfig, dataDir },
	};
}

// Stands in for resolveConfig so the test never reads the machine's ~/.aidd/config.json.
function reresolveFrom(config: ResolvedConfig) {
	const seen: ParsedArgs[] = [];
	const reresolve = (next: ParsedArgs): Promise<ResolvedConfig> => {
		seen.push({ ...next });
		return Promise.resolve({ ...config, cli: next.cli ?? config.cli });
	};
	return { reresolve, seen };
}

describe('applyProviderRest', () => {
	test('--cli naming a resting backend refuses with exit 2', async () => {
		const config = await restingConfig('claude-code');
		const args = parseArgs(['--cli', 'claude-code']);
		const { reresolve, seen } = reresolveFrom(config);
		expect(await applyProviderRest(args, config, '.', reresolve)).toEqual({ exitCode: 2 });
		expect(seen).toEqual([]);
	});

	test('a resting default moves to the substitute as if --cli had named it', async () => {
		const config = await restingConfig('claude-code');
		const args = parseArgs(['--model', 'claude-opus', '--reasoning-effort', 'high']);
		const { reresolve, seen } = reresolveFrom(config);
		const outcome = await applyProviderRest(args, config, '.', reresolve);
		expect('config' in outcome ? outcome.config.cli : null).toBe('codex');
		expect(seen.length).toBe(1);
		expect(seen[0]?.cli).toBe('codex');
		expect(seen[0]?.model).toBeUndefined();
		expect(seen[0]?.reasoningEffort).toBeUndefined();
	});

	test('--ignore-rest runs the resting backend untouched', async () => {
		const config = await restingConfig('claude-code');
		const args = parseArgs(['--cli', 'claude-code', '--ignore-rest']);
		const { reresolve } = reresolveFrom(config);
		expect(await applyProviderRest(args, config, '.', reresolve)).toEqual({ config });
	});

	test('a metadata check starts no agent, so rest does not apply', async () => {
		const config = await restingConfig('claude-code');
		const args = parseArgs(['--cli', 'claude-code', '--check-features']);
		const { reresolve } = reresolveFrom(config);
		expect(await applyProviderRest(args, config, '.', reresolve)).toEqual({ config });
	});
});

describe('parseRestUntil', () => {
	const now = new Date(2026, 9, 9, 15, 0, 0);

	test('reads durations', () => {
		expect(parseRestUntil('90m', now)?.getTime()).toBe(now.getTime() + 90 * 60_000);
		expect(parseRestUntil('2h', now)?.getTime()).toBe(now.getTime() + 120 * 60_000);
	});

	test('reads a clock time as today, or tomorrow once it has passed', () => {
		expect(parseRestUntil('17:40', now)?.getDate()).toBe(9);
		expect(parseRestUntil('06:00', now)?.getDate()).toBe(10);
	});

	test('rejects what it cannot read', () => {
		expect(parseRestUntil('soon', now)).toBeUndefined();
		expect(parseRestUntil('25:00', now)).toBeUndefined();
	});
});
