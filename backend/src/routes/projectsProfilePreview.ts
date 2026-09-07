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

import type { WebContext } from '../context.ts';

interface ProfilePreviewRequest {
	profile: unknown;
	projectId: string;
}

interface ProfilePreviewBase {
	auditNames: string[];
	mapping: Awaited<ReturnType<typeof loadAuditProfileMapping>>;
}

async function loadPreviewBase(context: WebContext): Promise<ProfilePreviewBase> {
	const [auditNames, mapping] = await Promise.all([
		discoverAuditNames(context.rootDir),
		loadAuditProfileMapping(context.rootDir),
	]);
	return { auditNames, mapping };
}

async function previewOneProjectProfile(
	context: WebContext,
	base: ProfilePreviewBase,
	request: ProfilePreviewRequest,
) {
	const profile = normalizeProjectAssuranceProfileInput(request.profile);
	const projectDir = await context.projectService.resolveDiscoveredProject(request.projectId);
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
	context: WebContext,
	projectId: string,
	profile: unknown,
) {
	const base = await loadPreviewBase(context);
	return await previewOneProjectProfile(context, base, { profile, projectId });
}

export async function createProjectProfilePreviews(
	context: WebContext,
	requests: ProfilePreviewRequest[],
) {
	const base = await loadPreviewBase(context);
	const entries = await Promise.all(
		requests.map(async (request) => [
			request.projectId,
			await previewOneProjectProfile(context, base, request),
		]),
	);
	return Object.fromEntries(entries);
}
