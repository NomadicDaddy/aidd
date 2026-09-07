import { describe, expect, test } from 'bun:test';

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

describe('release workflow', () => {
	test('publishes a tag with rendered notes and no built assets', async () => {
		const workflow = await readFile(
			join(process.cwd(), '.github', 'workflows', 'release.yml'),
			'utf8',
		);

		expect(workflow).toContain('bun run release:notes');
		expect(workflow).toContain('--notes-file dist/release/release-notes.md');
		expect(workflow).toContain('--verify-tag');
		expect(workflow).not.toContain('--generate-notes');
		// aidd ships no prebuilt assets. The install gate builds the portable frontend from source,
		// so the release still has no platform-specific runner requirement.
		expect(workflow).toContain('runs-on: ubuntu-latest');
		expect(workflow).not.toContain('windows-latest');
		expect(workflow).not.toContain('release:package');
		expect(workflow).not.toContain('release:check');
		expect(workflow).not.toContain('SHA256SUMS');
		expect(workflow).not.toContain('.zip');
	});

	test('documents the source-install gate and install-time frontend build', async () => {
		const guide = await readFile(
			join(process.cwd(), 'docs', 'architecture', 'releasing.md'),
			'utf8',
		);

		expect(guide).toContain('bun run check:source-install');
		expect(guide).toContain('`git archive`');
		expect(guide).toContain('`bun install --frozen-lockfile`');
		expect(guide).toContain('root `postinstall` hook');
		expect(guide).toContain('builds `frontend/dist`');
		expect(guide).toContain('Only after that source-integrity check passes');
	});
});
