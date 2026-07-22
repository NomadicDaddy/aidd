export { appLaunches, projectInitFailures, settings, systemMetrics } from './schema/appTables.ts';
export { diaryEntries } from './schema/diaryTables.ts';
export {
	directorChatMessages,
	directorChatSessions,
	directorCycles,
	directorProfiles,
	suggestions,
} from './schema/directorTables.ts';
// Barrel for the drizzle schema. Tables are grouped into domain modules but must be
// re-exported here unchanged so `import * as schema from './schema.ts'` and every direct
// named import keep resolving from this path. Import order mirrors the original single-file
// declaration order because foreign keys reference earlier table objects, which must exist at
// module-evaluation time (runs/pipeline tables → director tables → app tables).
export {
	invocationEvents,
	pipelineSessions,
	pipelineStepResults,
	runs,
} from './schema/runsTables.ts';
