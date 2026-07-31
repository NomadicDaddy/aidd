import { stat } from 'node:fs/promises';
import { basename, join } from 'node:path';

import type { Feature } from './features.ts';
import type { FeatureValidationResult } from './features/types.ts';
import type { AiddStore } from './store.ts';

/**
 * What a reconciliation pass changed, in the vocabulary the skills were told to report
 * (`updated` / unchanged / `errors`) so a run summary reads the same as the `roadmap:apply`
 * output it replaces. `total - updated` is the unchanged count.
 */
export interface MetadataReconcileResult {
	dependenciesWritten: number;
	errors: string[];
	/** Records that needed a write but were withheld because the pass was read-only. */
	skippedWrites: number;
	total: number;
	updated: number;
	validation: FeatureValidationResult;
	warnings: string[];
}

export interface MetadataReconcileOptions {
	/**
	 * Persist the propagated records. A read-only run still reports the drift it found, but must
	 * not rewrite priorities, dependencies, or `updatedAt` behind an operator who asked for a
	 * review — the report is the deliverable, and a silent mutation is not part of it.
	 */
	write?: boolean;
}

function featureDirectory(feature: Feature): string {
	return feature.directory ?? feature.id;
}

/** A project that has never had a roadmap, as distinct from one whose roadmap is broken. */
function isMissingRoadmap(error: unknown): boolean {
	return (
		typeof error === 'object' &&
		error !== null &&
		(error as { code?: unknown }).code === 'ENOENT'
	);
}

/**
 * A one-line rendering of a roadmap failure. Zod reports a multi-line JSON blob and the JSON parser
 * embeds a snippet, either of which would swamp the run summary this lands in.
 */
function describeRoadmapError(error: unknown): string {
	const message = error instanceof Error ? error.message : String(error);
	const flattened = message.replaceAll(/\s+/g, ' ').trim();
	return flattened.length > 200 ? `${flattened.slice(0, 197)}...` : flattened;
}

function dependenciesMatch(current: unknown, expected: string[]): boolean {
	if (!Array.isArray(current)) return false;
	if (current.length !== expected.length) return false;
	return expected.every((dependency) => current.includes(dependency));
}

/**
 * Detect the Spernakit template repository itself.
 *
 * Inside the template, feature records ARE the source of truth and the roadmap is free to rewrite
 * their dependencies. In a derived app the same records are copies that a template sync overwrites,
 * so rewriting them here just churns them until the next sync reverts the change.
 */
async function isTemplateRepo(projectDir: string): Promise<boolean> {
	if (basename(projectDir) !== 'spernakit') return false;
	return await stat(join(projectDir, 'scripts', 'init.ts')).then(
		() => true,
		() => false,
	);
}

/**
 * Propagate the roadmap into feature records and validate the result — the orchestrator-side
 * equivalent of `aidd-tools roadmap:apply` followed by `--check-features`.
 *
 * Both of those are aidd CLI entry points living in the aidd installation, so a skill step that
 * invoked them had to `cd` outside the project — which the native backend's workspace policy denies
 * outright, and which every other backend only got away with because the agent happened to have a
 * checkout to reach. Running the same reconciliation from the orchestrator removes the need: no
 * skill has to leave its workspace to keep priorities, dependencies, and contracts consistent.
 *
 * Semantics deliberately mirror `scripts/lib/aidd-workspace/roadmap.ts` (which stays as the
 * standalone tool, and serializes through Prettier for the template-sync flows that require it):
 * the roadmap's feature entries drive the sweep, so unmapped features are left alone rather than
 * force-assigned, and any structural error aborts every write instead of applying a partial pass.
 */
export async function reconcileProjectMetadata(
	store: AiddStore,
	options: MetadataReconcileOptions = {},
): Promise<MetadataReconcileResult> {
	const write = options.write ?? true;
	const errors: string[] = [];
	const warnings: string[] = [];
	let dependenciesWritten = 0;
	let skippedWrites = 0;
	let updated = 0;
	let total = 0;

	let roadmap;
	try {
		roadmap = await store.readRoadmap();
	} catch (error) {
		// Absent and unreadable are different problems. A project with no roadmap has nothing to
		// propagate and is fine; a roadmap that exists and will not parse is drift that used to be
		// caught by the `--check-features` step the skills no longer run, so it has to surface here
		// or it surfaces nowhere. Feature validation below deliberately ignores the roadmap too.
		if (!isMissingRoadmap(error)) {
			errors.push(`roadmap.json could not be read: ${describeRoadmapError(error)}`);
		}
		roadmap = undefined;
	}

	if (roadmap !== undefined) {
		const features = await store.listFeatures({ includeAudit: true });
		const featureByDirectory = new Map(features.map((f) => [featureDirectory(f), f]));
		const idByDirectory = new Map(features.map((f) => [featureDirectory(f), f.id]));
		const templateRepo = await isTemplateRepo(store.projectDir);
		const pending: Feature[] = [];
		total = Object.keys(roadmap.features).length;

		for (const [directory, entry] of Object.entries(roadmap.features)) {
			const feature = featureByDirectory.get(directory);
			if (feature === undefined) {
				errors.push(`Feature '${directory}': directory not found`);
				continue;
			}
			const milestone = entry.milestone ?? '';
			const priority = roadmap.milestones[milestone]?.priority;
			if (priority === undefined) {
				errors.push(
					`Feature '${directory}': unknown or unprioritized milestone '${milestone}'`,
				);
				continue;
			}
			// A template record's `dependencies` and `updatedAt` describe the upstream edit, not this
			// pass; only `priority` is app-local on such a record.
			const templateOwned = !templateRepo && typeof feature['spernakit_version'] === 'string';
			const resolved =
				templateOwned || entry.dependencies === undefined
					? undefined
					: resolveDependencies(entry.dependencies, idByDirectory, warnings);
			const priorityMatches = Number(feature.priority) === priority;
			if (
				priorityMatches &&
				(resolved === undefined || dependenciesMatch(feature.dependencies, resolved))
			)
				continue;
			if (resolved !== undefined) dependenciesWritten++;
			pending.push({
				...feature,
				...(resolved === undefined ? {} : { dependencies: resolved }),
				priority,
				...(templateOwned ? {} : { updatedAt: new Date().toISOString() }),
			});
		}

		// All-or-nothing: a roadmap that names a missing directory or an unknown milestone is drift a
		// human has to look at, and half-applying it would leave the records harder to read than the
		// state that was reported.
		if (errors.length !== 0) {
			dependenciesWritten = 0;
		} else if (write) {
			for (const feature of pending) await store.writeFeature(feature);
			updated = pending.length;
		} else {
			dependenciesWritten = 0;
			skippedWrites = pending.length;
		}
	}

	return {
		dependenciesWritten,
		errors,
		skippedWrites,
		total,
		updated,
		validation: await store.validateFeatures({ includeAudit: true }),
		warnings,
	};
}

/** Roadmap dependencies are keyed by feature *directory*; feature records reference feature *ids*. */
function resolveDependencies(
	declared: string[],
	idByDirectory: Map<string, string>,
	warnings: string[],
): string[] {
	const resolved: string[] = [];
	for (const name of declared) {
		const id = idByDirectory.get(name);
		if (id === undefined) {
			warnings.push(`Dependency '${name}' has no matching feature directory; skipping`);
			continue;
		}
		resolved.push(id);
	}
	return resolved;
}
