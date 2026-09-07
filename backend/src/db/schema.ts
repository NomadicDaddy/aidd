export { appLaunches, projectInitFailures, settings, systemMetrics } from './schema/appTables.ts';
export { diaryEntries } from './schema/diaryTables.ts';
export { directorCycles } from './schema/directorCycleTable.ts';
export {
	directorChatMessages,
	directorChatSessions,
	directorProfiles,
	suggestions,
} from './schema/directorTables.ts';
export { invocationEvents } from './schema/invocationTables.ts';
// Barrel for the drizzle schema. Tables are grouped into domain modules but must be
// re-exported here unchanged so `import * as schema from './schema.ts'` and every direct
// named import keep resolving from this path. Cross-module foreign keys live in Drizzle's lazy
// table-extras callbacks, so this sorted export order does not create an evaluation-order contract.
export { pipelineSessions, pipelineStepResults, runs } from './schema/runsTables.ts';
export {
	scheduledTaskExecutions,
	scheduledTaskProjects,
	scheduledTasks,
} from './schema/scheduledTables.ts';
