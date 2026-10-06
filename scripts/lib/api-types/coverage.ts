import type { ApiTypeInventory } from './inventory.ts';

export interface ApiCoverage {
	/** Frontend API modules with a contract surface. */
	covered: number;
	findings: string[];
	/** Frontend API modules that call the backend at all. */
	modules: number;
	/** Modules listed as having no contract inventory yet. */
	unchecked: number;
}

/**
 * Accounts for every frontend API module: each has a contract surface or is listed, with a reason,
 * as unchecked. The gate used to verify only the surfaces it was given and report "types match",
 * which read as parity across the whole API while most modules were never compared. A module that
 * appears without either is a finding, and so is a listed one that is now covered or gone, so the
 * unchecked list can only shrink by being kept honest.
 */
export function checkApiCoverage(inventory: ApiTypeInventory, apiModules: string[]): ApiCoverage {
	const covered = new Set(inventory.surfaces.map((surface) => surface.frontendModule));
	const unchecked = new Set(inventory.uncheckedModules.map((entry) => entry.module));
	const present = new Set(apiModules);
	const findings: string[] = [];
	for (const module of apiModules) {
		if (!covered.has(module) && !unchecked.has(module)) {
			findings.push(
				`${module} calls the API but has no contract surface and is not listed in uncheckedModules`,
			);
		}
	}
	for (const module of unchecked) {
		if (covered.has(module)) {
			findings.push(`${module} is listed in uncheckedModules but has a contract surface`);
		} else if (!present.has(module)) {
			findings.push(
				`${module} is listed in uncheckedModules but makes no API call or is gone`,
			);
		}
	}
	return {
		covered: apiModules.filter((module) => covered.has(module)).length,
		findings,
		modules: apiModules.length,
		unchecked: unchecked.size,
	};
}
