import type { WebDatabase } from '../../db/client.ts';
import type { ProjectInitFailureDto } from '../../types.ts';

import {
	dismissInitFailure,
	getInitFailureLogPath,
	getOpenInitFailure,
	listOpenInitFailures,
	recordInitFailure,
	type RecordInitFailureInput,
} from './initFailures.ts';

// Thin db-bound facade over the init-failure persistence functions, kept out of
// ProjectService so that service stays within the modularity budget.
export class ProjectInitFailureService {
	private readonly db: WebDatabase;

	constructor(db: WebDatabase) {
		this.db = db;
	}

	async record(input: RecordInitFailureInput): Promise<void> {
		await recordInitFailure(this.db, input);
	}

	async listOpen(): Promise<ProjectInitFailureDto[]> {
		return listOpenInitFailures(this.db);
	}

	async getOpen(id: string): Promise<ProjectInitFailureDto | undefined> {
		return getOpenInitFailure(this.db, id);
	}

	async getLogPath(id: string): Promise<null | string> {
		return getInitFailureLogPath(this.db, id);
	}

	async dismiss(id: string): Promise<boolean> {
		return dismissInitFailure(this.db, id);
	}
}
