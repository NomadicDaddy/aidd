import { and, desc, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import type { WebDatabase } from '../../db/client.ts';
import type { ProjectInitFailureDto } from '../../types.ts';

import { projectInitFailures } from '../../db/schema.ts';
import { recordDataMovement } from '../dataMovementTrace.ts';

export interface RecordInitFailureInput {
	description: null | string;
	errorSummary: string;
	logPath: null | string;
	name: string;
	quarantinePath: null | string;
	root: string;
	targetPath: string;
	template: string;
	templateUrl: null | string;
}

type Row = typeof projectInitFailures.$inferSelect;

function toDto(row: Row): ProjectInitFailureDto {
	return {
		createdAt: row.createdAt,
		description: row.description,
		errorSummary: row.errorSummary,
		hasLog: Boolean(row.logPath),
		id: row.id,
		name: row.name,
		quarantinePath: row.quarantinePath,
		root: row.root,
		targetPath: row.targetPath,
		template: row.template,
		templateUrl: row.templateUrl,
	};
}

// Records a failed template scaffold so it stays visible in the fleet. Never throws into
// the create flow: a failure here must not mask the underlying init error being surfaced.
export async function recordInitFailure(
	db: WebDatabase,
	input: RecordInitFailureInput,
): Promise<void> {
	try {
		await db.insert(projectInitFailures).values({
			createdAt: Date.now(),
			description: input.description,
			errorSummary: input.errorSummary.slice(0, 4000),
			id: randomUUID(),
			logPath: input.logPath,
			name: input.name,
			quarantinePath: input.quarantinePath,
			root: input.root,
			status: 'open',
			targetPath: input.targetPath,
			template: input.template,
			templateUrl: input.templateUrl,
		});
		recordDataMovement({
			category: 'database',
			operation: 'project.init-failure.record',
			status: 'success',
			summary: { name: input.name, template: input.template },
			target: 'projectInitFailures',
		});
	} catch {
		// Best-effort: the create flow already throws the real init error to the caller.
	}
}

export async function listOpenInitFailures(db: WebDatabase): Promise<ProjectInitFailureDto[]> {
	const rows = await db
		.select()
		.from(projectInitFailures)
		.where(eq(projectInitFailures.status, 'open'))
		.orderBy(desc(projectInitFailures.createdAt));
	return rows.map(toDto);
}

export async function getOpenInitFailure(
	db: WebDatabase,
	id: string,
): Promise<ProjectInitFailureDto | undefined> {
	const rows = await db
		.select()
		.from(projectInitFailures)
		.where(and(eq(projectInitFailures.id, id), eq(projectInitFailures.status, 'open')));
	const row = rows[0];
	return row ? toDto(row) : undefined;
}

export async function getInitFailureLogPath(db: WebDatabase, id: string): Promise<null | string> {
	const rows = await db
		.select({ logPath: projectInitFailures.logPath })
		.from(projectInitFailures)
		.where(eq(projectInitFailures.id, id));
	return rows[0]?.logPath ?? null;
}

export async function dismissInitFailure(db: WebDatabase, id: string): Promise<boolean> {
	const result = await db
		.update(projectInitFailures)
		.set({ status: 'dismissed' })
		.where(and(eq(projectInitFailures.id, id), eq(projectInitFailures.status, 'open')))
		.returning({ id: projectInitFailures.id });
	return result.length > 0;
}
