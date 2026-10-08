import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { migrations } from '../../backend/src/db/migrations/registry.ts';

// DATA-009 (audit-assertions-1790856991): a released migration is never edited. The registry
// pinned the version list and migrate.ts refuses a database without the baseline row, but nothing
// pinned the CONTENT of a released file, so a quiet edit to 0001_baseline.sql would have shipped as
// a different schema under the same version. These are the files as released in v3.4.0; a schema
// change goes in a new numbered migration, which means one new entry here, never an edited hash.
const MIGRATIONS_DIR = join(import.meta.dir, '..', '..', 'backend', 'src', 'db', 'migrations');

const RELEASED_MIGRATION_SHA256: Record<string, string> = {
	'0001_baseline': '53ea2e13eacca429806cf537045ebc9f4fc2c653cfc94d603cab18c9aed8486b',
	'0002_director_auto_launch_decision':
		'7b9223cd3665a3bc4b402fc85f3ae83e1375a8333899ff41db465834e4e4116d',
	'0003_pipeline_step_attempt_identity':
		'd96e0854f1ff70614b35ce4e8a87023867dc75b133ee8568019e15baf7bd152d',
	'0004_director_json_constraints':
		'f78ffde64419898f935f29e4c85c680854d901866a59e700a10f406324c22df1',
	'0005_run_json_domain_constraints':
		'cb603d2d543d2cfd40895fec78b0e13cfa5977592dfb9f418facabf34057bff9',
	'0006_schedule_json_fk_constraints':
		'd2d276b844c0d971088df445e2d1c03e03c86a6968f7dd006148a34f4ab3d047',
	'0007_metrics_diary_constraints':
		'419ae42d4cf30493b0da8cf6759da849df2caa155aace682b776ce22ea6a890c',
	'0008_scheduled_directive_target':
		'90ef24adcb9f0ede757a4a44494b069bc194765c9da4d96fbed8d1ee746c13bc',
	'0009_system_metrics_timestamp_index':
		'c2cdb1a6a72b631af654d95b2b504868b63dfab32710991f82d247c38dfe53ca',
	'0010_runs_status_queued': '984cbd82695c0731c99d7ca0d8f81961de7c40b482c0c1634a3ce7b774fa4c8d',
};

async function sha256OfMigration(version: string): Promise<string> {
	// CRLF-normalised so a checkout under core.autocrlf hashes the same bytes git stores.
	const text = (await readFile(join(MIGRATIONS_DIR, `${version}.sql`), 'utf8')).replaceAll(
		'\r\n',
		'\n',
	);
	return new Bun.CryptoHasher('sha256').update(text).digest('hex');
}

describe('released migrations are immutable', () => {
	test('every released migration still has the content it shipped with', async () => {
		for (const [version, expected] of Object.entries(RELEASED_MIGRATION_SHA256)) {
			const actual = await sha256OfMigration(version);
			expect(
				actual,
				`${version}.sql differs from its released content. A released migration is never edited; put the schema change in a new numbered migration and add its hash here.`,
			).toBe(expected);
		}
	});

	test('every released migration is still registered, in order, ahead of the unreleased ones', () => {
		const released = Object.keys(RELEASED_MIGRATION_SHA256);
		expect(migrations.slice(0, released.length).map((m) => m.version)).toEqual(released);
		// The registry may be longer (migrations landed since the last release); it may not be
		// shorter, and it may not reorder what shipped.
		expect(migrations.length).toBeGreaterThanOrEqual(released.length);
	});

	test('the pin is a real check: a different content hashes differently', async () => {
		const baseline = await sha256OfMigration('0001_baseline');
		const altered = new Bun.CryptoHasher('sha256')
			.update(
				`${await readFile(join(MIGRATIONS_DIR, '0001_baseline.sql'), 'utf8')}\n-- edited\n`,
			)
			.digest('hex');
		expect(altered).not.toBe(baseline);
	});
});
