import type { ProjectAuditEvidence } from 'aidd-shared';

import {
	isLowExposureLocalProfile,
	normalizeProjectAssuranceProfileInput,
	requiresFullHardening,
	resolveProjectAuditEffect,
} from 'aidd-shared';
import {
	loadAuditProfileMapping,
	loadAuditProfileOverrides,
} from 'aidd-shared/metadata/audit-profile-mapping';
import { readProjectAuditEvidence } from 'aidd-shared/metadata/project-surfaces';
import { discoverAuditNames } from 'aidd-shared/modes/audit-shared';

// Audit applicability for a candidate (unsaved) assurance profile: what the Profile tab shows
// while the operator edits, through the same resolvers the Director and the maturity stage use,
// honouring the project's own audit overrides and what its tree is built from: an audit the
// candidate profile allows still does not apply to a project with no web frontend to load, and
// the preview must say what a run would do. A service, not a route: it imports no Elysia and
// needs only the catalog root and a way to resolve a project id to its directory.
export interface ProfilePreviewDeps {
	resolveProject: (projectId: string) => Promise<string>;
	rootDir: string;
}

interface ProfilePreviewRequest {
	profile: unknown;
	projectId: string;
}

interface ProfilePreviewBase {
	auditNames: string[];
	mapping: Awaited<ReturnType<typeof loadAuditProfileMapping>>;
}

export interface ProfilePreview {
	audits: {
		applies: boolean;
		effect: ReturnType<typeof resolveProjectAuditEffect>['effect'];
		name: string;
		/** Why the audit does not apply, when the project lacks what the audit measures. */
		reason?: string;
		/**
		 * For an audit that requires a surface: which one, whether the project has it, and the
		 * evidence in words. `undecided` means the file scan did not finish, so the audit applies
		 * because nothing ruled the surface out and not because it was found; a screen tells that
		 * apart from this flag and never from the wording of `evidence`.
		 */
		surface?: { evidence?: string; name: string; present: boolean; undecided: boolean };
	}[];
	isLowExposureLocal: boolean;
	requiresFullHardening: boolean;
}

function requiredSurface(
	mapping: ProfilePreviewBase['mapping'],
	evidence: ProjectAuditEvidence,
	auditName: string,
): ProfilePreview['audits'][number]['surface'] {
	const name = mapping.requiresSurface?.[auditName];
	if (name === undefined) return undefined;
	const text = evidence.surfaces.get(name);
	return {
		...(text === undefined ? {} : { evidence: text }),
		name,
		present: text !== undefined,
		undecided: evidence.undecidedSurfaces?.has(name) === true,
	};
}

async function loadPreviewBase(rootDir: string): Promise<ProfilePreviewBase> {
	const [auditNames, mapping] = await Promise.all([
		discoverAuditNames(rootDir),
		loadAuditProfileMapping(rootDir),
	]);
	return { auditNames, mapping };
}

async function previewOneProjectProfile(
	deps: ProfilePreviewDeps,
	base: ProfilePreviewBase,
	request: ProfilePreviewRequest,
): Promise<ProfilePreview> {
	const profile = normalizeProjectAssuranceProfileInput(request.profile);
	const projectDir = await deps.resolveProject(request.projectId);
	const [overrides, evidence] = await Promise.all([
		loadAuditProfileOverrides(projectDir),
		readProjectAuditEvidence(projectDir, base.mapping),
	]);
	const audits = base.auditNames
		.map((name) => {
			const cell = resolveProjectAuditEffect(
				profile,
				evidence,
				name,
				base.mapping,
				overrides,
			);
			const surface = requiredSurface(base.mapping, evidence, name);
			return {
				applies: cell.applies,
				effect: cell.effect,
				name,
				...(cell.reason === undefined ? {} : { reason: cell.reason }),
				...(surface === undefined ? {} : { surface }),
			};
		})
		.sort((left, right) => left.name.localeCompare(right.name));
	return {
		audits,
		isLowExposureLocal: isLowExposureLocalProfile(profile),
		requiresFullHardening: requiresFullHardening(profile),
	};
}

export async function createProjectProfilePreview(
	deps: ProfilePreviewDeps,
	projectId: string,
	profile: unknown,
): Promise<ProfilePreview> {
	const base = await loadPreviewBase(deps.rootDir);
	return await previewOneProjectProfile(deps, base, { profile, projectId });
}

export async function createProjectProfilePreviews(
	deps: ProfilePreviewDeps,
	requests: ProfilePreviewRequest[],
): Promise<Record<string, ProfilePreview>> {
	const base = await loadPreviewBase(deps.rootDir);
	const entries = await Promise.all(
		requests.map(async (request): Promise<[string, ProfilePreview]> => [
			request.projectId,
			await previewOneProjectProfile(deps, base, request),
		]),
	);
	return Object.fromEntries(entries);
}
