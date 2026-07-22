// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./sql.d.ts" />
import init0001 from './0001_unhinged_taco_party.sql' with { type: 'text' };

/**
 * Migration definitions bundled at module load time.
 *
 * Each `.sql` file is imported with `{ type: 'text' }` so Bun statically embeds
 * its CONTENTS (as a string) into bundles and compiled standalone binaries. Add
 * new migrations by importing the SQL file the same way and appending to the
 * `migrations` array — never `readFileSync` a dynamic path, since dynamic reads
 * are not embedded by `bun build --compile`.
 *
 * Deliberately no top-level await here (the previous `{ type: 'file' }` +
 * `await Bun.file().text()` form had it): under `bun test --parallel`
 * (`--isolate`), a consumer module could observe this module mid-evaluation and
 * crash with "Cannot access 'migrations' before initialization".
 */

interface MigrationDefinition {
	sql: string;
	version: string;
}

export const migrations: MigrationDefinition[] = [
	{
		sql: init0001,
		version: '0001_unhinged_taco_party',
	},
];
