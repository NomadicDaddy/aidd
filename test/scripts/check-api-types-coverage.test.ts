import { afterEach, describe, expect, test } from 'bun:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { ApiTypeInventory } from '../../scripts/lib/api-types/inventory.ts';

import { checkApiCoverage } from '../../scripts/lib/api-types/coverage.ts';
import { discoverApiModules } from '../../scripts/lib/api-types/discover.ts';
import { testTempDir } from '../_helpers/temp.ts';
import { removeTempTree } from '../backend/_helpers/remove-temp-tree.ts';

// check:api-types compared the two surfaces it was given and reported "types match", which read
// as parity across the whole browser API while most modules were never compared. Every module now
// has a contract surface or is listed as unchecked, and the gate says how many of each.

const roots: string[] = [];

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => removeTempTree(root)));
});

function inventory(covered: string[], unchecked: string[]): ApiTypeInventory {
	return {
		surfaces: covered.map((frontendModule) => ({
			backendRoute: 'backend/src/routes/x.ts',
			contracts: [],
			frontendModule,
			pathPrefix: '/api/v1/x',
		})),
		uncheckedModules: unchecked.map((module) => ({ module, reason: 'not yet' })),
	};
}

describe('checkApiCoverage', () => {
	test('every module accounted for passes and reports the split', () => {
		const coverage = checkApiCoverage(inventory(['a.ts'], ['b.ts', 'c.ts']), [
			'a.ts',
			'b.ts',
			'c.ts',
		]);
		expect(coverage).toEqual({ covered: 1, findings: [], modules: 3, unchecked: 2 });
	});

	test('a new API module with neither a surface nor a listing is a finding', () => {
		const coverage = checkApiCoverage(inventory(['a.ts'], []), ['a.ts', 'new.ts']);
		expect(coverage.findings).toEqual([
			'new.ts calls the API but has no contract surface and is not listed in uncheckedModules',
		]);
	});

	test('a listing that is now covered, or whose module is gone, is a finding', () => {
		const coverage = checkApiCoverage(inventory(['a.ts'], ['a.ts', 'gone.ts']), ['a.ts']);
		expect(coverage.findings).toEqual([
			'a.ts is listed in uncheckedModules but has a contract surface',
			'gone.ts is listed in uncheckedModules but makes no API call or is gone',
		]);
	});
});

describe('discoverApiModules', () => {
	test('finds modules whose calls name no literal path, and skips those with none', async () => {
		const root = await testTempDir('aidd-api-modules-');
		roots.push(root);
		const api = join(root, 'frontend', 'src', 'api');
		await mkdir(join(api, 'types'), { recursive: true });
		await writeFile(
			join(api, 'computed.ts'),
			'export const read = (id: string) => apiGet(projectApiPath(id));\n',
		);
		await writeFile(
			join(api, 'literal.ts'),
			"export const save = () => apiSend('/api/v1/x', 'POST', {});\n",
		);
		await writeFile(join(api, 'helpers.ts'), 'export const twice = (n: number) => n * 2;\n');
		await writeFile(join(api, 'types', 'x.ts'), 'export const t = apiGet("/api/v1/t");\n');

		expect(discoverApiModules(root)).toEqual([
			'frontend/src/api/computed.ts',
			'frontend/src/api/literal.ts',
		]);
	});
});
