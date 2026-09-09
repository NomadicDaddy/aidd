import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

import { modeNames } from '../../shared/src/plan/types.ts';

const root = resolve(import.meta.dir, '../..');

async function read(path: string): Promise<string> {
	return (await Bun.file(resolve(root, path)).text()).replace(/\s+/g, ' ');
}

describe('operational documentation contracts', () => {
	test('quickstart names the artifact-check report instead of promising no writes', async () => {
		const doc = await read('docs/quickstart.md');
		expect(doc).toContain('.aidd/.artifacts-check.json');
		expect(doc).toContain('do not change application code');
		expect(doc).not.toContain('without mutating anything');
	});

	test('write-scope documentation discloses recovery commits and shell limits', async () => {
		const doc = await read('docs/reference/what-aidd-modifies.md');
		expect(doc).toContain('Completion recovery');
		expect(doc).toContain('recorded as written by the run');
		expect(doc).toContain('normal Git hooks still apply');
		expect(doc).toContain('not a host-level filesystem boundary');
		expect(doc).toContain('copies can overwrite matching files');
		expect(doc).not.toContain('never auto-commits');
		expect(doc).not.toContain('does not auto-commit');
	});

	test('the glossary includes current modes, maturity, and creation lanes', async () => {
		const doc = await read('CONTEXT.md');
		const mode = doc.slice(doc.indexOf('**Mode**'), doc.indexOf('**Phase**'));
		for (const name of modeNames) expect(mode).toContain(`\`${name}\``);
		expect(mode).not.toContain('`role`');
		expect(doc).toContain('audited → shipped');
		expect(doc).toContain('From GitHub');
		expect(doc).toContain('Scheduled automatic Cycles can also launch');
	});

	test('audit applicability no longer describes implemented filters as broken', async () => {
		const doc = await read('docs/reference/audit-applicability.md');
		expect(doc).toContain('All ten facets are validated, retained during normalization');
		expect(doc).not.toContain('do not currently take effect');
	});

	test('deployment covers postinstall builds and live log rotation', async () => {
		const doc = await read('docs/reference/deployment.md');
		expect(doc).toContain('postinstall step builds the frontend');
		expect(doc).toContain('does not rebuild the UI');
		expect(doc).toContain('every 30 seconds');
		expect(doc).toContain('five-archive and 30-day retention');
		expect(doc).toContain('Logs can exceed 10 MiB between checks');
	});

	test('version comparison describes the released baseline', async () => {
		const doc = await read('docs/architecture/version-comparison.md');
		expect(doc).toContain('public release from September 7, 2026');
		expect(doc).not.toContain('release candidate');
		expect(doc).not.toContain('Publication is planned');
	});
});
