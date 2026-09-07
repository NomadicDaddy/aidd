import { describe, expect, test } from 'bun:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
	resolveDogfoodAppUrl,
	resolveTargetAppUrl,
} from '../../backend/src/services/run/targetAppUrl.ts';
import { testTempDir } from '../_helpers/temp.ts';

// Fixtures under testTempRoot are swept as one tree by the preload at the next suite start, so
// these deliberately do not clean up after themselves.
async function makeProject(name: string, config?: unknown): Promise<string> {
	const dir = await testTempDir(`target-app-url-${name}`);
	const projectDir = join(dir, name);
	await mkdir(join(projectDir, 'config'), { recursive: true });
	if (config !== undefined) {
		await writeFile(join(projectDir, 'config', `${name}.json`), JSON.stringify(config));
	}
	return projectDir;
}

describe('resolveTargetAppUrl', () => {
	// The failure this exists to prevent: agents probing localhost:3000 / :5173 while the project's
	// own config declared a different port.
	test('resolves the declared frontend port into an address', async () => {
		const projectDir = await makeProject('demoapp', {
			server: { backendPort: 3331, frontendPort: 3330 },
		});
		expect(await resolveTargetAppUrl(projectDir)).toBe('http://localhost:3330');
	});

	test('returns null when only a backend port is declared', async () => {
		const projectDir = await makeProject('backendonly', { server: { backendPort: 3331 } });
		expect(await resolveTargetAppUrl(projectDir)).toBeNull();
	});

	// No hint beats a wrong hint: a guessed address sends the agent at whatever else is listening.
	test('returns null when the project declares no config', async () => {
		const projectDir = await makeProject('noconfig');
		expect(await resolveTargetAppUrl(projectDir)).toBeNull();
	});

	test('returns null for a project directory that does not exist', async () => {
		expect(await resolveTargetAppUrl(join('does', 'not', 'exist'))).toBeNull();
	});

	test('rejects an out-of-range port rather than emitting a bad address', async () => {
		const projectDir = await makeProject('badport', { server: { frontendPort: 99999 } });
		expect(await resolveTargetAppUrl(projectDir)).toBeNull();
	});
});

describe('resolveDogfoodAppUrl', () => {
	// The failure this exists to prevent: agent-browser opening `http://0.0.0.0:3210` and dying with
	// net::ERR_ADDRESS_INVALID, so the UI feature parks for manual verification for no reason.
	test('resolves a wildcard bind host to a reachable loopback address', () => {
		expect(resolveDogfoodAppUrl('0.0.0.0', 3210)).toBe('http://127.0.0.1:3210');
		expect(resolveDogfoodAppUrl('::', 3210)).toBe('http://127.0.0.1:3210');
	});

	test('preserves an already-connectable host', () => {
		expect(resolveDogfoodAppUrl('127.0.0.1', 3210)).toBe('http://127.0.0.1:3210');
		expect(resolveDogfoodAppUrl('localhost', 8080)).toBe('http://localhost:8080');
	});
});
