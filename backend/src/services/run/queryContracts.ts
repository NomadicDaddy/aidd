import type { ResolvedConfig, ResolvedWebConfig } from 'aidd-shared/config';

import type { WebDatabase } from '../../db/client.ts';
import type { DbCommands } from '../../db/commands.ts';
import type { WebSocketHub } from '../../webSocketHub.ts';

import { type runs } from '../../db/schema.ts';

export type WebRunRow = typeof runs.$inferSelect;

export interface QueriesContext {
	commands: DbCommands;
	config: { web: ResolvedWebConfig } & ResolvedConfig;
	db: WebDatabase;
	hub: WebSocketHub;
	onProjectChanged?: (projectPath: string) => void;
}
