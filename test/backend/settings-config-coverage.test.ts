import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { describe, expect, test } from 'bun:test';

import { configSchema } from 'aidd-shared/config';

import { settingsConfigBody } from '../../backend/src/routes/settings.ts';

const REPO_ROOT = resolve(import.meta.dir, '..', '..');

/**
 * Config keys the runtime reads but the settings UI deliberately does not edit. Each needs a
 * reason: an entry here is a decision that the key stays JSON-only, not a place to park a gap.
 *
 * The failure this guards against is not "a key has no form control" — it is the half-wired
 * field. `maxConsecutiveTimeoutRetries` sat plumbed through the DTO, the service input, the write
 * path, the read path, the frontend type and the blank-form factory while being absent from the
 * route body and the PUT payload, so it looked wired from every angle and could never be set.
 * `maxTokens` and `maxCostUsd` were simply never carried into the web layer at all.
 */
const JSON_ONLY: Record<string, string> = {
	channels: 'Edited through the dedicated telegram key on the settings payload.',
	complexityTieredPlanning: 'Planner-internal tier switch; power-user knob, JSON only.',
	consistencyGateEnabled: 'Orchestrator gate toggle; power-user knob, JSON only.',
	director:
		'Edited through the flattened directorChat*/directorSuggestion* keys. The deprecated schedule block is read once to seed the built-in Director scheduled task, then owned by that task.',
	preflightDoctor: 'Defaults on; disabling it is a debugging escape hatch, JSON only.',
	web: 'Edited through flattened keys (port, hostname, maxConcurrentRuns, …).',
};

function schemaKeys(): string[] {
	return Object.keys(configSchema.shape).sort();
}

function bodyKeys(): string[] {
	return Object.keys(settingsConfigBody.properties).sort();
}

describe('settings config coverage', () => {
	test('every config key is editable or explicitly declared JSON-only', () => {
		const accepted = new Set(bodyKeys());
		const unaccounted = schemaKeys().filter(
			(key) => !accepted.has(key) && JSON_ONLY[key] === undefined,
		);
		expect(unaccounted).toEqual([]);
	});

	test('the JSON-only allowlist has no stale entries', () => {
		const accepted = new Set(bodyKeys());
		const schema = new Set(schemaKeys());
		for (const key of Object.keys(JSON_ONLY)) {
			// A key that gained an editor should lose its exemption, and a key that left the schema
			// should lose its entry — otherwise the allowlist rots into a list of lies.
			expect(schema.has(key)).toBe(true);
			expect(accepted.has(key)).toBe(false);
		}
	});

	test('every field the route accepts is actually sent by the frontend', async () => {
		// The PUT body in the frontend api layer is a hand-maintained allowlist, so a field can be
		// accepted end-to-end by the backend and still be undeliverable from the browser.
		const source = await readFile(
			join(REPO_ROOT, 'frontend', 'src', 'api', 'settings.ts'),
			'utf8',
		);
		const missing = bodyKeys().filter((key) => !new RegExp(`\\b${key}:`).test(source));
		expect(missing).toEqual([]);
	});

	test('run budget fields reach the settings form', async () => {
		const [types, blank, section] = await Promise.all([
			readFile(join(REPO_ROOT, 'frontend', 'src', 'api', 'types', 'settings.ts'), 'utf8'),
			readFile(
				join(REPO_ROOT, 'frontend', 'src', 'pages', 'settings', 'settingsUtils.ts'),
				'utf8',
			),
			readFile(
				join(REPO_ROOT, 'frontend', 'src', 'pages', 'settings', 'RunLimitsSection.tsx'),
				'utf8',
			),
		]);
		for (const field of ['maxCostUsd', 'maxTokens', 'maxConsecutiveTimeoutRetries']) {
			expect(types).toContain(`${field}:`);
			expect(blank).toContain(`${field}:`);
			expect(section).toContain(`'${field}'`);
		}
	});
});
