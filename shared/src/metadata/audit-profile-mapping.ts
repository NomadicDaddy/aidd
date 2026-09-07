import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import {
	type AuditProfileMapping,
	type AuditProfileOverrides,
	normalizeAuditProfileMapping,
	normalizeAuditProfileOverrides,
} from '../index.ts';
import { printJson } from './json-format.ts';
import { metadataPath } from './paths.ts';

const mappingFileName = 'audit-profile-mapping.json';
const overridesFileName = 'audit-profile-overrides.json';

interface CachedMapping {
	mapping: AuditProfileMapping;
	mtimeMs: number;
}

const mappingCache = new Map<string, CachedMapping>();

export function auditProfileMappingPath(catalogDir: string): string {
	return join(catalogDir, 'audits', mappingFileName);
}

export function auditProfileOverridesPath(projectDir: string): string {
	return join(metadataPath(projectDir), overridesFileName);
}

const emptyMapping: AuditProfileMapping = { rules: [], version: 1 };

export async function loadAuditProfileMapping(catalogDir: string): Promise<AuditProfileMapping> {
	const filePath = auditProfileMappingPath(catalogDir);
	let stats: Awaited<ReturnType<typeof stat>>;
	try {
		stats = await stat(filePath);
	} catch {
		return emptyMapping;
	}
	const cached = mappingCache.get(filePath);
	if (cached && cached.mtimeMs === stats.mtimeMs) return cached.mapping;
	const raw = JSON.parse(await readFile(filePath, 'utf8')) as unknown;
	const mapping = normalizeAuditProfileMapping(raw);
	mappingCache.set(filePath, { mapping, mtimeMs: stats.mtimeMs });
	return mapping;
}

export async function writeAuditProfileMapping(
	catalogDir: string,
	mapping: AuditProfileMapping,
): Promise<AuditProfileMapping> {
	const normalized = normalizeAuditProfileMapping(mapping);
	const filePath = auditProfileMappingPath(catalogDir);
	await mkdir(dirname(filePath), { recursive: true });
	await writeFile(filePath, printJson(normalized));
	mappingCache.delete(filePath);
	return normalized;
}

export async function loadAuditProfileOverrides(
	projectDir: string,
): Promise<AuditProfileOverrides | null> {
	const filePath = auditProfileOverridesPath(projectDir);
	let text: string;
	try {
		text = await readFile(filePath, 'utf8');
	} catch (error) {
		if (isFileNotFound(error)) return null;
		throw new Error(
			`Failed to read ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
			{ cause: error },
		);
	}
	let raw: unknown;
	try {
		raw = JSON.parse(text) as unknown;
	} catch (error) {
		throw new Error(
			`Failed to parse ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
			{ cause: error },
		);
	}
	try {
		return normalizeAuditProfileOverrides(raw);
	} catch (error) {
		throw new Error(
			`Invalid ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
			{ cause: error },
		);
	}
}

function isFileNotFound(error: unknown): boolean {
	return (
		typeof error === 'object' &&
		error !== null &&
		'code' in error &&
		(error as { code?: unknown }).code === 'ENOENT'
	);
}

export async function writeAuditProfileOverrides(
	projectDir: string,
	overrides: AuditProfileOverrides,
): Promise<AuditProfileOverrides> {
	const normalized = normalizeAuditProfileOverrides({
		...overrides,
		updatedAt: overrides.updatedAt || new Date().toISOString(),
	});
	const filePath = auditProfileOverridesPath(projectDir);
	await mkdir(dirname(filePath), { recursive: true });
	await writeFile(filePath, printJson(normalized));
	return normalized;
}
