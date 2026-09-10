import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

import {
	findManifestParityProblems,
	findScaffoldParityProblems,
} from '../../scripts/check-scaffold.ts';
import { SMOKE_QC_STEPS } from '../../scripts/smoke-qc.ts';

const ROOT = resolve(import.meta.dir, '..', '..');

describe('scaffold contract', () => {
	test('the live scaffold matches its root-owned contracts', () => {
		expect(findScaffoldParityProblems(ROOT)).toEqual([]);
	});

	test('dependency drift from the root manifest is rejected', () => {
		const root = {
			devDependencies: { eslint: '10.8.1' },
			engines: { bun: '>=1.4.2' },
			packageManager: 'bun@1.4.2',
		};
		const scaffold = {
			devDependencies: { eslint: '10.7.0' },
			engines: { bun: '>=1.4.2' },
			packageManager: 'bun@1.4.2',
			scripts: {
				'format:check': 'prettier --check .',
				lint: 'eslint .',
				preinstall: 'bun scripts/require-bun.ts',
				'smoke:qc': 'bun run typecheck',
				typecheck: 'tsc --noEmit',
			},
		};

		expect(findManifestParityProblems(root, scaffold)).toEqual([
			'scaffolding/package.json devDependency eslint must match package.json (10.7.0 != 10.8.1).',
		]);
	});

	test('missing scaffold quality scripts are rejected', () => {
		const manifest = {
			devDependencies: {},
			engines: { bun: '>=1.4.2' },
			packageManager: 'bun@1.4.2',
			scripts: {},
		};

		expect(findManifestParityProblems(manifest, manifest)).toEqual([
			'scaffolding/package.json must define the format:check script.',
			'scaffolding/package.json must define the lint script.',
			'scaffolding/package.json must define the preinstall script.',
			'scaffolding/package.json must define the smoke:qc script.',
			'scaffolding/package.json must define the typecheck script.',
		]);
	});

	test('root smoke:qc executes the scaffold contract', () => {
		expect(SMOKE_QC_STEPS.map((step) => step.command.join(' '))).toContain(
			'bun run check:scaffold',
		);
	});
});
