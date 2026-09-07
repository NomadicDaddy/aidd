import { readFileSync } from 'node:fs';

export interface ApiTypeReference {
	exportName: string;
	module: string;
}

export interface ApiTypePair {
	backend: ApiTypeReference;
	frontend: ApiTypeReference;
}

export interface ApiTypeInventoryEntry {
	endpoint: string;
	request?: ApiTypePair | undefined;
	response?: ApiTypePair | undefined;
}

export interface ApiTypeSurface {
	backendRoute: string;
	contracts: ApiTypeInventoryEntry[];
	frontendModule: string;
	pathPrefix: string;
}

export interface ApiTypeInventory {
	surfaces: ApiTypeSurface[];
}

function record(value: unknown, label: string): Record<string, unknown> {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new Error(`${label} must be an object`);
	}
	return value as Record<string, unknown>;
}

function text(value: unknown, label: string): string {
	if (typeof value !== 'string' || value.trim() === '') {
		throw new Error(`${label} must be a non-empty string`);
	}
	return value;
}

function typeReference(value: unknown, label: string): ApiTypeReference {
	const parsed = record(value, label);
	return {
		exportName: text(parsed.exportName, `${label}.exportName`),
		module: text(parsed.module, `${label}.module`),
	};
}

function typePair(value: unknown, label: string): ApiTypePair {
	const parsed = record(value, label);
	return {
		backend: typeReference(parsed.backend, `${label}.backend`),
		frontend: typeReference(parsed.frontend, `${label}.frontend`),
	};
}

function contract(value: unknown, label: string): ApiTypeInventoryEntry {
	const parsed = record(value, label);
	const result: ApiTypeInventoryEntry = { endpoint: text(parsed.endpoint, `${label}.endpoint`) };
	if (parsed.request !== undefined) result.request = typePair(parsed.request, `${label}.request`);
	if (parsed.response !== undefined)
		result.response = typePair(parsed.response, `${label}.response`);
	return result;
}

function surface(value: unknown, label: string): ApiTypeSurface {
	const parsed = record(value, label);
	if (!Array.isArray(parsed.contracts)) throw new Error(`${label}.contracts must be an array`);
	return {
		backendRoute: text(parsed.backendRoute, `${label}.backendRoute`),
		contracts: parsed.contracts.map((entry, index) =>
			contract(entry, `${label}.contracts[${index}]`),
		),
		frontendModule: text(parsed.frontendModule, `${label}.frontendModule`),
		pathPrefix: text(parsed.pathPrefix, `${label}.pathPrefix`),
	};
}

export function readApiTypeInventory(path: string): ApiTypeInventory {
	let value: unknown;
	try {
		value = JSON.parse(readFileSync(path, 'utf8')) as unknown;
	} catch (err) {
		throw new Error(
			`cannot read inventory: ${err instanceof Error ? err.message : String(err)}`,
			{ cause: err },
		);
	}
	const parsed = record(value, 'inventory');
	if (!Array.isArray(parsed.surfaces)) throw new Error('inventory.surfaces must be an array');
	return {
		surfaces: parsed.surfaces.map((entry, index) => surface(entry, `surfaces[${index}]`)),
	};
}
