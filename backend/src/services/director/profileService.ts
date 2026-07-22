import type { DirectorProfileRecord, DirectorProfileUpdate } from 'aidd-shared';

import { eq } from 'drizzle-orm';

import type { WebDatabase } from '../../db/client.ts';
import type { DirectorConfigProvider, ProfileRow } from './types.ts';

import { directorProfiles } from '../../db/schema.ts';
import {
	cleanOptionalText,
	cleanText,
	defaultProfileId,
	defaultProfileRole,
	mapProfile,
	maxProfileTextLength,
	normalizeBackend,
	normalizeReasoningEffort,
} from './helpers.ts';

export class DirectorProfileService {
	private readonly db: WebDatabase;
	private readonly getConfig: DirectorConfigProvider;

	constructor(db: WebDatabase, getConfig: DirectorConfigProvider) {
		this.db = db;
		this.getConfig = getConfig;
	}

	async getProfile(): Promise<DirectorProfileRecord> {
		return mapProfile(await this.ensureDefaultProfile());
	}

	async updateProfile(input: DirectorProfileUpdate): Promise<DirectorProfileRecord> {
		const existing = await this.ensureDefaultProfile();
		const now = Date.now();
		const backend =
			input.backend === undefined ? existing.backend : normalizeBackend(input.backend);
		const reasoningEffort =
			input.reasoningEffort === undefined
				? existing.reasoningEffort
				: normalizeReasoningEffort(input.reasoningEffort);
		const values: ProfileRow = {
			backend,
			createdAt: existing.createdAt,
			id: defaultProfileId,
			instructions:
				input.instructions === undefined
					? existing.instructions
					: cleanText(input.instructions, maxProfileTextLength),
			model: input.model === undefined ? existing.model : cleanOptionalText(input.model, 200),
			reasoningEffort,
			role:
				input.role === undefined
					? existing.role
					: cleanText(input.role, 200) || defaultProfileRole,
			updatedAt: now,
		};
		await this.db
			.update(directorProfiles)
			.set({
				backend: values.backend,
				instructions: values.instructions,
				model: values.model,
				reasoningEffort: values.reasoningEffort,
				role: values.role,
				updatedAt: values.updatedAt,
			})
			.where(eq(directorProfiles.id, defaultProfileId));
		return mapProfile(values);
	}

	async ensureDefaultProfile(): Promise<ProfileRow> {
		const row = (
			await this.db
				.select()
				.from(directorProfiles)
				.where(eq(directorProfiles.id, defaultProfileId))
		)[0];
		if (row) return row;
		const config = this.getConfig();
		const now = Date.now();
		const profile: ProfileRow = {
			backend: config.cli,
			createdAt: now,
			id: defaultProfileId,
			instructions: '',
			model: config.backends?.[config.cli]?.model ?? config.model ?? null,
			reasoningEffort: config.reasoningEffort,
			role: defaultProfileRole,
			updatedAt: now,
		};
		// The director page fires several requests on first load, each calling ensureDefaultProfile();
		// a plain insert races two of them into a UNIQUE(id) violation on a fresh DB. Ignore the
		// conflict and re-read so every caller returns the authoritative row the winner wrote.
		await this.db.insert(directorProfiles).values(profile).onConflictDoNothing();
		const seeded = (
			await this.db
				.select()
				.from(directorProfiles)
				.where(eq(directorProfiles.id, defaultProfileId))
		)[0];
		return seeded ?? profile;
	}
}
