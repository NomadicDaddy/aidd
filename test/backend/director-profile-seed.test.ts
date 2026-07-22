import { Database } from 'bun:sqlite';
import { beforeEach, describe, expect, test } from 'bun:test';

import type { DirectorConfig } from '../../backend/src/services/director/types.ts';

import { wrapWebDatabase, type WebDatabase } from '../../backend/src/db/client.ts';
import { migrateWebDatabase } from '../../backend/src/db/migrate.ts';
import { directorProfiles } from '../../backend/src/db/schema.ts';
import { DirectorProfileService } from '../../backend/src/services/director/profileService.ts';

let db: WebDatabase;

beforeEach(() => {
	const sqlite = new Database(':memory:');
	migrateWebDatabase(sqlite);
	db = wrapWebDatabase(sqlite).db;
});

// ensureDefaultProfile only reads these fields off the config.
const config = (): DirectorConfig =>
	({
		backends: {},
		cli: 'native',
		model: null,
		reasoningEffort: 'low',
	}) as unknown as DirectorConfig;

describe('DirectorProfileService.ensureDefaultProfile', () => {
	// The director page fires several requests on first load; on a fresh DB each raced into a
	// UNIQUE(id) insert and returned a 500 until the seed was made idempotent.
	test('concurrent first-load calls seed exactly one profile without racing', async () => {
		const service = new DirectorProfileService(db, config);

		const results = await Promise.all(
			Array.from({ length: 8 }, () => service.ensureDefaultProfile())
		);

		for (const row of results) {
			expect(row.id).toBe('default');
			expect(row.role).toBe('Fleet Director');
		}
		expect(await db.select().from(directorProfiles)).toHaveLength(1);
	});
});
