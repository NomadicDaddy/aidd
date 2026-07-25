import { describe, expect, test } from 'bun:test';

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

describe('release workflow', () => {
	test('packages and uploads release assets instead of notes only', async () => {
		const workflow = await readFile(
			join(process.cwd(), '.github', 'workflows', 'release.yml'),
			'utf8',
		);

		expect(workflow).toContain('bun run release:package -- --target bun-windows-x64-modern');
		expect(workflow).toContain(
			'bun run release:check -- --target bun-windows-x64-modern --skip-command-gates',
		);
		expect(workflow).toContain('dist/release/*.zip');
		expect(workflow).toContain('dist/release/SHA256SUMS.txt');
		expect(workflow).toContain('dist/release/release-notes.md');
		expect(workflow).toContain('--notes-file dist/release/release-notes.md');
		expect(workflow).not.toContain('--generate-notes');
		// Packaging MUST run on Windows: the aidd-web binary is compiled with
		// --windows-hide-console, which Bun only permits when compiling on Windows.
		expect(workflow).toContain('runs-on: windows-latest');
	});
});
