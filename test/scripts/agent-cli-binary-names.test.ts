import { describe, expect, test } from 'bun:test';

import type { BackendName } from 'aidd-shared/plan/types';
import { buildBackendCommand } from 'aidd-shared/backends/commands';

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * The agent CLIs are no longer baked into the image (2.116.0): the entrypoint installs them at
 * first boot, and check-image-licenses proves none were re-baked. Both work in BINARY names, and
 * a binary name is not the package name — `@kilocode/cli` installs `kilo`. Get that wrong and both
 * fail silently in opposite directions: the entrypoint's "already installed?" probe never matches,
 * so it reinstalls on every container start, and the redistribution guard looks for a binary that
 * cannot exist, so it waves a re-baked CLI through. Neither surfaces as an error.
 *
 * buildBackendCommand is the single source of truth for what each backend actually invokes; pin
 * the shell script and the guard to it.
 */
const CLI_BACKENDS: BackendName[] = ['claude-code', 'cline', 'codex', 'kilocode', 'opencode'];

function binaryFor(backend: BackendName): string {
	return buildBackendCommand(backend, { cwd: '.', text: 'noop' }).command;
}

describe('agent CLI binary names', () => {
	test('the entrypoint probes the binary each backend actually invokes', async () => {
		const entrypoint = await readFile(join('docker', 'entrypoint.sh'), 'utf8');

		const probed = [
			...entrypoint.matchAll(/^\s*install_agent_cli\s+\S+\s+\S+\s+(\S+)\s*$/gm),
		].map((match) => match[1]);

		expect(probed.sort()).toEqual(CLI_BACKENDS.map(binaryFor).sort());
	});

	test('the redistribution guard forbids the binary each backend actually invokes', async () => {
		const guard = await readFile(join('scripts', 'check-image-licenses.ts'), 'utf8');
		const declared = /const FORBIDDEN_IN_IMAGE = \[([^\]]+)\]/.exec(guard)?.[1];

		expect(declared).toBeDefined();
		const forbidden = [...(declared ?? '').matchAll(/'([^']+)'/g)].map((match) => match[1]);

		expect(forbidden.sort()).toEqual(CLI_BACKENDS.map(binaryFor).sort());
	});
});
