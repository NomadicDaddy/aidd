#!/usr/bin/env bun
/**
 * Verifies independently defined browser API contracts against their backend counterparts.
 *
 * Enforces: QUAL-001 (aidd) -- smoke:qc includes the API parity safeguard promised by the
 * Director feature contract.
 *
 * Run: bun run check:api-types [--root <dir>]
 */
import { join, resolve } from 'node:path';
import { cwd, exit } from 'node:process';
import { parseArgs } from 'node:util';

import type { ApiTypePair } from './lib/api-types/inventory.ts';

import {
	discoverBackendEndpoints,
	discoverFrontendEndpoints,
	discoverFrontendModules,
} from './lib/api-types/discover.ts';
import { readApiTypeInventory } from './lib/api-types/inventory.ts';
import { checkTypeParity } from './lib/api-types/type-parity.ts';

function setDifferences(expected: Set<string>, actual: Set<string>, label: string): string[] {
	return [...expected]
		.filter((entry) => !actual.has(entry))
		.sort()
		.map((entry) => `${label} lacks inventory endpoint ${entry}`);
}

export function runApiTypes(projectRoot = cwd()): number {
	const root = resolve(projectRoot);
	try {
		const inventory = readApiTypeInventory(join(root, 'scripts', 'api-type-inventory.json'));
		if (inventory.surfaces.length === 0) {
			console.error('[FAIL] check:api-types inventory contains no API surfaces.');
			return 1;
		}

		const findings: string[] = [];
		const pairs: ApiTypePair[] = [];
		let endpointCount = 0;
		for (const surface of inventory.surfaces) {
			if (surface.contracts.length === 0) {
				findings.push(`${surface.frontendModule} has no endpoint inventory entries`);
				continue;
			}
			const inventoried = new Set(surface.contracts.map((entry) => entry.endpoint));
			if (inventoried.size !== surface.contracts.length) {
				findings.push(`${surface.frontendModule} has duplicate endpoint inventory entries`);
			}
			const backend = discoverBackendEndpoints(join(root, surface.backendRoute));
			const frontend = discoverFrontendEndpoints(join(root, surface.frontendModule));
			const frontendModules = discoverFrontendModules(root, surface.pathPrefix);
			for (const module of frontendModules) {
				if (module !== surface.frontendModule) {
					findings.push(`${module} lacks an inventory surface for ${surface.pathPrefix}`);
				}
			}
			findings.push(...setDifferences(backend, inventoried, surface.backendRoute));
			findings.push(...setDifferences(frontend, inventoried, surface.frontendModule));
			findings.push(...setDifferences(inventoried, backend, 'backend route'));
			findings.push(...setDifferences(inventoried, frontend, 'frontend API module'));
			endpointCount += inventoried.size;
			for (const entry of surface.contracts) {
				if (entry.request) pairs.push(entry.request);
				if (entry.response) pairs.push(entry.response);
			}
		}
		if (endpointCount === 0 || pairs.length === 0) {
			console.error('[FAIL] check:api-types examined no endpoints or type contracts.');
			return 1;
		}
		if (findings.length === 0) {
			findings.push(...checkTypeParity(root, pairs).map((finding) => finding.message));
		}
		if (findings.length > 0) {
			for (const finding of findings) console.error(`- ${finding}`);
			console.log(
				`[FAIL] check:api-types -- ${findings.length} finding(s) across ` +
					`${endpointCount} endpoint(s) and ${pairs.length} request/response contract(s).`,
			);
			return 1;
		}
		console.log(
			`[OK] check:api-types -- ${endpointCount} endpoint(s) and ${pairs.length} ` +
				'request/response contract(s) examined; backend and frontend types match.',
		);
		return 0;
	} catch (err) {
		console.error(
			`[FAIL] check:api-types could not run: ${err instanceof Error ? err.message : String(err)}`,
		);
		return 2;
	}
}

if (import.meta.main) {
	let root: string | undefined;
	try {
		const { values } = parseArgs({
			args: Bun.argv.slice(2),
			options: { root: { type: 'string' } },
			strict: true,
		});
		root = values.root;
	} catch (err) {
		console.error(`[FAIL] check:api-types: ${(err as Error).message}`);
		console.error('Usage: check:api-types [--root <dir>]');
		exit(2);
	}
	exit(runApiTypes(root));
}
