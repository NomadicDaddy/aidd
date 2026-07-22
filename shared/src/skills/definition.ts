import { isAbsolute } from 'node:path';

import { yamlFrontmatterFrom } from '../markdown/frontmatter.ts';
import { firstHeading, usageFrom } from './markdown.ts';

export const skillCategories = [
	'audit-remediation',
	'general',
	'metadata',
	'recipe-maturity',
	'runtime',
	'spernakit-fleet',
] as const;

export type SkillCategory = (typeof skillCategories)[number];
export type SkillOrigin = 'bundled' | 'imported';

export interface ImportedSkillRecord {
	category: SkillCategory;
	importedAt: string;
	sourcePath: string;
	sourceSha256: string;
}

export interface ImportedSkillRegistry {
	schemaVersion: 1;
	skills: Record<string, ImportedSkillRecord>;
}

export interface SkillDefinition {
	allowedTools?: string;
	body: string;
	category: SkillCategory;
	compatibility?: string;
	/** Sibling skill ids whose SKILL.md this skill reads at runtime; staged into `.aidd/skills/<id>/`. */
	contracts?: string[];
	description: string;
	extensions: Record<string, unknown>;
	id: string;
	imported?: ImportedSkillRecord;
	license?: string;
	metadata: Record<string, string>;
	origin: SkillOrigin;
	/** Repo-relative files this skill reads at runtime (e.g. `audits/SEVERITY_CLASSIFICATION.md`); staged into `.aidd/<path>`. */
	references?: string[];
	sourcePath: string;
	/** Spernakit-root-relative files this skill reads at runtime (e.g. `docs/template/STACK.md`); staged into `.aidd/<path>` when a spernakit root is configured. */
	spernakitReferences?: string[];
	supportPaths: string[];
	title: string;
	usage: string;
}

export const skillIdPattern = /^(?!.*--)[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const knownFrontmatterKeys = new Set([
	'allowed-tools',
	'compatibility',
	'description',
	'license',
	'metadata',
	'name',
]);

export function validateSkillId(id: string): void {
	if (!skillIdPattern.test(id)) throw new Error(`Invalid skill id: ${id}`);
}

export function isSkillCategory(value: unknown): value is SkillCategory {
	return typeof value === 'string' && (skillCategories as readonly string[]).includes(value);
}

function metadataFrom(id: string, value: unknown): Record<string, string> {
	if (value === undefined) return {};
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new Error(`Skill ${id}: metadata must be a string map`);
	}
	const metadata: Record<string, string> = {};
	for (const [key, entry] of Object.entries(value)) {
		if (typeof entry !== 'string') {
			throw new Error(`Skill ${id}: metadata.${key} must be a string`);
		}
		metadata[key] = entry;
	}
	return metadata;
}

function optionalString(
	id: string,
	key: string,
	value: unknown,
	maxLength?: number
): string | undefined {
	if (value === undefined) return undefined;
	if (typeof value !== 'string' || value.trim().length === 0) {
		throw new Error(`Skill ${id}: ${key} must be a non-empty string`);
	}
	if (maxLength !== undefined && value.length > maxLength) {
		throw new Error(`Skill ${id}: ${key} must be at most ${maxLength} characters`);
	}
	return value;
}

// Split a comma-separated metadata value (e.g. `metadata.aidd-contracts`) into trimmed,
// non-empty entries. Custom aidd frontmatter lives under `metadata` (the Agent Skills vendor
// namespace, like `aidd-category`), and metadata values are strings, so lists are comma-joined.
function splitMetadataList(value: string | undefined): string[] {
	if (value === undefined) return [];
	return value
		.split(',')
		.map((entry) => entry.trim())
		.filter((entry) => entry.length > 0);
}

// Sibling skill ids this skill reads at runtime (from `metadata.aidd-contracts`). Each is
// validated as a skill id so the scaffolder can stage `skills/<id>/` into the workspace
// `.aidd/skills/<id>/` without a traversal risk.
function contractsFrom(value: string | undefined): string[] | undefined {
	const entries = splitMetadataList(value);
	if (entries.length === 0) return undefined;
	for (const entry of entries) validateSkillId(entry);
	return entries;
}

// Root-relative files this skill reads at runtime (from `metadata.aidd-references` or
// `metadata.spernakit-references`, e.g. `audits/SEVERITY_CLASSIFICATION.md`). Paths are
// constrained to strict children of their resolution root so the scaffolder can copy
// `<root>/<ref>` into `.aidd/<ref>` without escaping the install tree or the workspace.
function referencesFrom(id: string, key: string, value: string | undefined): string[] | undefined {
	const entries = splitMetadataList(value);
	if (entries.length === 0) return undefined;
	const result: string[] = [];
	for (const entry of entries) {
		const normalized = entry.replaceAll('\\', '/');
		if (isAbsolute(entry) || normalized.split('/').includes('..')) {
			throw new Error(`Skill ${id}: ${key} must be repo-relative paths without ".."`);
		}
		result.push(normalized);
	}
	return result;
}

function categoryFrom(
	id: string,
	origin: SkillOrigin,
	metadata: Record<string, string>,
	imported?: ImportedSkillRecord
): SkillCategory {
	if (imported) return imported.category;
	const category = metadata['aidd-category'];
	if (origin === 'imported' && category === undefined) return 'general';
	if (!isSkillCategory(category)) {
		throw new Error(
			`Skill ${id}: metadata.aidd-category must be one of: ${skillCategories.join(', ')}`
		);
	}
	return category;
}

export function parseSkillDefinition(input: {
	body: string;
	id: string;
	imported?: ImportedSkillRecord;
	origin: SkillOrigin;
	sourcePath: string;
	supportPaths?: string[];
}): SkillDefinition {
	validateSkillId(input.id);
	const frontmatter = yamlFrontmatterFrom(input.body);
	const name = optionalString(input.id, 'name', frontmatter.values.name, 64);
	if (name === undefined) {
		throw new Error(`Skill ${input.id}: frontmatter name is required`);
	}
	if (name !== input.id) {
		throw new Error(`Skill ${input.id}: frontmatter name must match its directory name`);
	}
	// The Agent Skills spec sets no hard description-length limit; it only truncates the combined
	// description + when_to_use text at 1,536 chars in the skill listing (configurable via
	// skillListingMaxDescChars). Cap at that display threshold so a description is never silently cut.
	const description = optionalString(
		input.id,
		'description',
		frontmatter.values.description,
		1536
	);
	if (!description) throw new Error(`Skill ${input.id}: description is required`);
	const compatibility = optionalString(
		input.id,
		'compatibility',
		frontmatter.values.compatibility,
		500
	);
	const license = optionalString(input.id, 'license', frontmatter.values.license);
	const allowedTools = optionalString(
		input.id,
		'allowed-tools',
		frontmatter.values['allowed-tools']
	);
	const metadata = metadataFrom(input.id, frontmatter.values.metadata);
	const contracts = contractsFrom(metadata['aidd-contracts']);
	const references = referencesFrom(input.id, 'aidd-references', metadata['aidd-references']);
	const spernakitReferences = referencesFrom(
		input.id,
		'spernakit-references',
		metadata['spernakit-references']
	);
	const content = input.body.slice(frontmatter.contentStart);
	const extensions = Object.fromEntries(
		Object.entries(frontmatter.values).filter(([key]) => !knownFrontmatterKeys.has(key))
	);
	return {
		...(allowedTools ? { allowedTools } : {}),
		body: input.body,
		category: categoryFrom(input.id, input.origin, metadata, input.imported),
		...(compatibility ? { compatibility } : {}),
		...(contracts ? { contracts } : {}),
		description,
		extensions,
		id: input.id,
		...(input.imported ? { imported: input.imported } : {}),
		...(license ? { license } : {}),
		metadata,
		origin: input.origin,
		...(references ? { references } : {}),
		...(spernakitReferences ? { spernakitReferences } : {}),
		sourcePath: input.sourcePath,
		supportPaths: input.supportPaths ?? [],
		title: firstHeading(content, input.id),
		usage: usageFrom(content),
	};
}
