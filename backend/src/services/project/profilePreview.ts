import {
	isLowExposureLocalProfile,
	normalizeProjectAssuranceProfileInput,
	requiresFullHardening,
	resolveAuditEffect,
} from 'aidd-shared';
import {
	loadAuditProfileMapping,
	loadAuditProfileOverrides,
} from 'aidd-shared/metadata/audit-profile-mapping';
import { discoverAuditNames } from 'aidd-shared/modes/audit-shared';

// Audit applicability for a candidate (unsaved) assurance profile: what the Profile tab shows
// while the operator edits, through the same resolvers the Director and the maturity stage use,
// honouring the project's own audit overrides. A service, not a route: it imports no Elysia and
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
		effect: ReturnType<typeof resolveAuditEffect>['effect'];
		name: string;
	}[];
	isLowExposureLocal: boolean;
	requiresFullHardening: boolean;
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
	const overrides = await loadAuditProfileOverrides(projectDir);
	const audits = base.auditNames
		.map((name) => {
			const cell = resolveAuditEffect(profile, name, base.mapping, overrides);
			return { applies: cell.applies, effect: cell.effect, name };
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
