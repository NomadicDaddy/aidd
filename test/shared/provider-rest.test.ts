import { defaultWebConfig, type ResolvedConfig } from 'aidd-shared/config';
import { resolveRestedLaunchTarget } from 'aidd-shared/plan/launch-target';
import {
	decideRestedBackend,
	type ProviderRest,
	type RestDecisionInput,
} from 'aidd-shared/provider-rest/decide';
import {
	clearProviderRest,
	providerRestDir,
	readProviderRests,
	restFromRateLimit,
	writeProviderRest,
} from 'aidd-shared/provider-rest/store';
import { describe, expect, test } from 'bun:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { testTempDir } from '../_helpers/temp.ts';

const now = new Date('2026-10-09T15:00:00.000Z');

function rest(backend: ProviderRest['backend'], minutes: number, reason = 'limit'): ProviderRest {
	return {
		backend,
		reason,
		source: 'manual',
		setAt: now.toISOString(),
		until: new Date(now.getTime() + minutes * 60_000).toISOString(),
	};
}

function decide(overrides: Partial<RestDecisionInput>) {
	return decideRestedBackend({
		ignoreRest: false,
		now,
		personPicked: false,
		requested: 'claude-code',
		rests: [],
		substitutes: ['codex', 'claude-code', 'native'],
		...overrides,
	});
}

describe('decideRestedBackend', () => {
	test('a backend that is not resting runs as asked', () => {
		expect(decide({ rests: [rest('codex', 30)] })).toEqual({
			backend: 'claude-code',
			kind: 'run',
		});
	});

	test('a rest that has ended does not hold the backend', () => {
		expect(decide({ rests: [rest('claude-code', -1)] })).toEqual({
			backend: 'claude-code',
			kind: 'run',
		});
	});

	test('a default launch moves to the first substitute and says why', () => {
		const decision = decide({ rests: [rest('claude-code', 30, 'rate limit')] });
		expect(decision.kind).toBe('run');
		if (decision.kind !== 'run') return;
		expect(decision.backend).toBe('codex');
		expect(decision.substitution?.from).toBe('claude-code');
		expect(decision.substitution?.note).toStartWith(
			'codex, substituted for claude-code: resting until ',
		);
		expect(decision.substitution?.note).toEndWith(' (rate limit)');
	});

	test('a substitute that is itself resting is skipped', () => {
		const decision = decide({ rests: [rest('claude-code', 30), rest('codex', 30)] });
		expect(decision.kind === 'run' ? decision.backend : null).toBe('native');
	});

	test('a person who picked the resting backend is refused, with somewhere to go', () => {
		const decision = decide({ personPicked: true, rests: [rest('claude-code', 30, 'quota')] });
		expect(decision.kind).toBe('refuse');
		if (decision.kind !== 'refuse') return;
		expect(decision.alternative).toBe('codex');
		expect(decision.message).toStartWith('claude-code is resting until ');
		expect(decision.message).toEndWith(' (quota)');
	});

	test('when everything is resting the launch refuses and names the rest that ends first', () => {
		const decision = decide({
			rests: [rest('claude-code', 90), rest('codex', 60), rest('native', 30)],
		});
		expect(decision.kind).toBe('refuse');
		if (decision.kind !== 'refuse') return;
		expect(decision.alternative).toBeUndefined();
		expect(decision.rest.backend).toBe('native');
	});

	test('ignoreRest runs the resting backend, even for a person', () => {
		const decision = decide({
			ignoreRest: true,
			personPicked: true,
			rests: [rest('claude-code', 30)],
		});
		expect(decision).toEqual({ backend: 'claude-code', kind: 'run' });
	});
});

const config: ResolvedConfig = {
	auditModel: 'glm-audit',
	backends: { codex: { model: 'gpt-codex' } },
	cli: 'claude-code',
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
	reasoningEffort: 'medium',
	timeoutSeconds: 3600,
	web: defaultWebConfig,
};
const restContext = {
	ignoreRest: false,
	now,
	personPicked: false,
	rests: [rest('claude-code', 30)],
};

describe('resolveRestedLaunchTarget', () => {
	test('a substitute runs on its own model, never the one chosen for the resting backend', () => {
		const resolved = resolveRestedLaunchTarget(
			config,
			'audit',
			{ model: 'claude-opus', reasoningEffort: 'high' },
			restContext,
			{},
		);
		expect(resolved.kind).toBe('run');
		if (resolved.kind !== 'run') return;
		expect(resolved.target.backend).toBe('codex');
		expect(resolved.target.backendSource).toBe('substituted');
		expect(resolved.target.model).toBe('gpt-codex');
		expect(resolved.target.reasoningEffort).not.toBe('high');
		expect(resolved.substitution?.from).toBe('claude-code');
	});

	test('a person override of the resting backend comes back as a refusal', () => {
		const resolved = resolveRestedLaunchTarget(
			config,
			'coding',
			{ backend: 'claude-code' },
			{ ...restContext, personPicked: true },
			{},
		);
		expect(resolved.kind).toBe('refuse');
	});

	test('personPicked without an override is a default launch, so it substitutes', () => {
		const resolved = resolveRestedLaunchTarget(
			config,
			'coding',
			{},
			{ ...restContext, personPicked: true },
			{},
		);
		expect(resolved.kind === 'run' ? resolved.target.backend : null).toBe('codex');
	});
});

describe('provider rest store', () => {
	test('writes, reads back while active, and clears', async () => {
		const dataDir = await testTempDir('provider-rest-');
		await writeProviderRest(dataDir, rest('grok', 30));
		expect(await readProviderRests(dataDir, now)).toEqual([rest('grok', 30)]);
		expect(await readProviderRests(dataDir, new Date(now.getTime() + 31 * 60_000))).toEqual([]);
		await clearProviderRest(dataDir, 'grok');
		expect(await readProviderRests(dataDir, now)).toEqual([]);
	});

	test('a damaged or misnamed rest file is read as not resting', async () => {
		const dataDir = await testTempDir('provider-rest-');
		await mkdir(providerRestDir(dataDir), { recursive: true });
		await writeFile(join(providerRestDir(dataDir), 'codex.json'), '{ not json');
		await writeFile(
			join(providerRestDir(dataDir), 'grok.json'),
			JSON.stringify(rest('codex', 30)),
		);
		expect(await readProviderRests(dataDir, now)).toEqual([]);
	});

	test('a rate limit rests only the subscription CLIs', async () => {
		const dataDir = await testTempDir('provider-rest-');
		const until = new Date(now.getTime() + 20 * 60_000);
		expect(await restFromRateLimit(dataDir, 'native', until, now)).toBeUndefined();
		const rested = await restFromRateLimit(dataDir, 'codex', until, now);
		expect(rested?.source).toBe('rate_limit');
		expect(rested?.until).toBe(until.toISOString());
	});

	test('a rate limit extends a rest but never shortens one a person set', async () => {
		const dataDir = await testTempDir('provider-rest-');
		await writeProviderRest(dataDir, rest('claude-code', 120, 'by hand'));
		const shorter = new Date(now.getTime() + 30 * 60_000);
		const kept = await restFromRateLimit(dataDir, 'claude-code', shorter, now);
		expect(kept?.reason).toBe('by hand');
		const longer = new Date(now.getTime() + 180 * 60_000);
		const extended = await restFromRateLimit(dataDir, 'claude-code', longer, now);
		expect(extended?.until).toBe(longer.toISOString());
	});
});
