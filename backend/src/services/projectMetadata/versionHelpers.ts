import type { Feature } from 'aidd-shared/metadata/features';
import type { DetectProjectStackOptions, ProjectStack } from 'aidd-shared/metadata/project-stack';
import type { FileAiddStore } from 'aidd-shared/metadata/store';

import { detectProjectStack } from 'aidd-shared/metadata/project-stack';
import { evaluateRoadmapCodingGate } from 'aidd-shared/metadata/roadmap';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

import type { ProjectPorts, ProjectRoadmapSummary } from '../../types.ts';

import { readJsonOrNull, readTextOrNull, statOrNull } from '../fsHelpers.ts';
import { gatherRuntimePorts, isTcpPort } from './runtimePortDiscovery.ts';

interface PackageJson {
	spernakit_version?: unknown;
	version?: unknown;
}

interface RawConfigShape {
	backendPort?: unknown;
	frontendPort?: unknown;
	port?: unknown;
	server?: { backendPort?: unknown; frontendPort?: unknown };
	web?: { port?: unknown };
}

interface DefaultsJson {
	app?: { slug?: unknown };
}

export async function gatherVersionInfo(
	projectDir: string,
	stackOptions: DetectProjectStackOptions = {},
): Promise<{
	appVersion: null | string;
	stack: ProjectStack;
	templateVersion: null | string;
}> {
	const pkg = await readJsonOrNull<PackageJson>(join(projectDir, 'package.json'));
	const stack = await detectProjectStack(projectDir, stackOptions);
	return {
		appVersion: typeof pkg?.version === 'string' ? pkg.version : null,
		stack,
		templateVersion: typeof pkg?.spernakit_version === 'string' ? pkg.spernakit_version : null,
	};
}

function extractPorts(cfg: RawConfigShape): null | ProjectPorts {
	const backendCandidate =
		typeof cfg.server?.backendPort === 'number'
			? cfg.server.backendPort
			: typeof cfg.backendPort === 'number'
				? cfg.backendPort
				: typeof cfg.port === 'number'
					? cfg.port
					: null;
	const frontendCandidate =
		typeof cfg.server?.frontendPort === 'number'
			? cfg.server.frontendPort
			: typeof cfg.frontendPort === 'number'
				? cfg.frontendPort
				: typeof cfg.web?.port === 'number'
					? cfg.web.port
					: null;
	const backendPort = isTcpPort(backendCandidate) ? backendCandidate : null;
	const frontendPort = isTcpPort(frontendCandidate) ? frontendCandidate : null;
	if (backendPort !== null || frontendPort !== null) {
		return { backendPort, frontendPort };
	}
	return null;
}

/**
 * Scan `config/*.json` for any file containing port configuration.
 * Skips known non-config files (config-schema.json, example.json).
 * @param configDir
 * @returns The extracted ports or null if none found.
 */
async function scanConfigDirForPorts(configDir: string): Promise<null | ProjectPorts> {
	let entries: string[];
	try {
		entries = await readdir(configDir);
	} catch {
		return null;
	}
	const skipNames = new Set(['config-schema.json', 'example.json']);
	for (const name of entries) {
		if (!name.endsWith('.json') || skipNames.has(name)) continue;
		const cfg = await readJsonOrNull<RawConfigShape>(join(configDir, name));
		if (!cfg) continue;
		const ports = extractPorts(cfg);
		if (ports) return ports;
	}
	return null;
}

/**
 * Resolve the spernakit app slug from `backend/src/config/defaults.json`
 * so we can find `config/{slug}.json` when the directory name differs.
 * @param projectDir
 * @returns The resolved slug or null.
 */
async function resolveSpernakitSlug(projectDir: string): Promise<null | string> {
	const defaults = await readJsonOrNull<DefaultsJson>(
		join(projectDir, 'backend', 'src', 'config', 'defaults.json'),
	);
	if (defaults?.app?.slug && typeof defaults.app.slug === 'string') {
		return defaults.app.slug;
	}
	return null;
}

export async function gatherPorts(projectDir: string): Promise<null | ProjectPorts> {
	const dirSlug = (projectDir.split(/[\\/]/).pop() ?? '')
		.toLowerCase()
		.replace(/[^a-z0-9-]/g, '-');

	// Primary candidates: config/{dirSlug}.json and config.json
	const primaryCandidates = [
		join(projectDir, 'config', `${dirSlug}.json`),
		join(projectDir, 'config.json'),
	];
	for (const path of primaryCandidates) {
		const cfg = await readJsonOrNull<RawConfigShape>(path);
		if (!cfg) continue;
		const ports = extractPorts(cfg);
		if (ports) return ports;
	}

	// Spernakit fallback: resolve slug from defaults.json
	const spernakitSlug = await resolveSpernakitSlug(projectDir);
	if (spernakitSlug && spernakitSlug !== dirSlug) {
		const cfg = await readJsonOrNull<RawConfigShape>(
			join(projectDir, 'config', `${spernakitSlug}.json`),
		);
		if (cfg) {
			const ports = extractPorts(cfg);
			if (ports) return ports;
		}
	}

	// Broad fallback: scan any config/*.json for port fields.
	const configPorts = await scanConfigDirForPorts(join(projectDir, 'config'));
	if (configPorts) return configPorts;
	return gatherRuntimePorts(projectDir, await detectProjectStack(projectDir));
}

export async function gatherSpecUpdatedAt(metadataDir: string): Promise<null | string> {
	const stats = await statOrNull(join(metadataDir, 'spec.md'));
	return stats ? stats.mtime.toISOString() : null;
}

/**
 * Resolve the "date added" for a project by reading the `.aidd/` directory's
 * birthtime. Falls back to mtime when birthtime is unavailable (some
 * filesystems do not support it).
 * @param projectDir The project root directory (parent of `.aidd/`).
 * @returns ISO timestamp string, or null if `.aidd/` does not exist.
 */
export async function gatherAddedAt(projectDir: string): Promise<null | string> {
	const stats = await statOrNull(join(projectDir, '.aidd'));
	if (!stats) return null;
	const time = stats.birthtime.getTime() || stats.mtime.getTime();
	return time ? new Date(time).toISOString() : null;
}

export async function gatherRoadmap(
	store: FileAiddStore,
	features?: Feature[],
): Promise<null | ProjectRoadmapSummary> {
	const [roadmapResult, resolvedFeatures] = await Promise.all([
		store.readRoadmap().then(
			(value) => ({ ok: true as const, value }),
			() => ({ ok: false as const }),
		),
		features !== undefined
			? Promise.resolve(features)
			: store.listFeatures({ includeAudit: true }),
	]);
	if (!roadmapResult.ok) return null;
	const roadmap = roadmapResult.value;
	const passesById = new Map<string, boolean>();
	for (const feature of resolvedFeatures) {
		passesById.set(feature.id, Boolean(feature.passes));
	}
	const milestoneNames = Object.keys(roadmap.milestones);
	const milestones: ProjectRoadmapSummary['milestones'] = {};
	let currentMilestone: null | string = null;
	for (const name of milestoneNames) {
		let total = 0;
		let completed = 0;
		for (const [featureId, entry] of Object.entries(roadmap.features)) {
			if (entry.milestone !== name) continue;
			total++;
			if (passesById.get(featureId) === true) completed++;
		}
		milestones[name] = { completed, total };
		if (currentMilestone === null && total > 0 && completed < total) {
			currentMilestone = name;
		}
	}
	if (currentMilestone === null && milestoneNames.length > 0) {
		currentMilestone = milestoneNames[milestoneNames.length - 1] ?? null;
	}
	const gate = evaluateRoadmapCodingGate(roadmap, resolvedFeatures);
	return {
		currentMilestone,
		invalidMappings: gate.invalidMappings,
		milestoneOrder: milestoneNames,
		milestones,
		unmappedFeatureDirectories: gate.unmappedFeatureDirectories,
	};
}

export async function countNumberedListItems(path: string): Promise<null | number> {
	const content = await readTextOrNull(path);
	if (content === null) return null;
	let count = 0;
	for (const line of content.split('\n')) {
		if (/^\s*\d+\./.test(line)) count++;
	}
	return count;
}

export async function countScreenMapRoutes(path: string): Promise<null | number> {
	const content = await readTextOrNull(path);
	if (content === null) return null;
	let count = 0;
	for (const line of content.split('\n')) {
		if (/^\|\s*`/.test(line)) count++;
	}
	return count;
}
