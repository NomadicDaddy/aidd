import type { WebDatabase } from '../../db/client.ts';
import type {
	ProjectCreateInputDto,
	ProjectCreateResultDto,
	ProjectInitFailureDto,
} from '../../types.ts';

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

	// Retry a failed creation with the inputs the failure recorded, then clear the failure so it
	// leaves the fleet. Undefined means the failure is not open; the caller answers 404. The
	// create step is injected: this service knows failures, ProjectService knows creation.
	async retry(
		id: string,
		createProject: (input: ProjectCreateInputDto) => Promise<ProjectCreateResultDto>,
	): Promise<ProjectCreateResultDto | undefined> {
		const failure = await this.getOpen(id);
		if (!failure) return undefined;
		const result = await createProject({
			description: failure.description,
			mode: 'fresh',
			name: failure.name,
			root: failure.root,
			spec: null,
			// A github-template failure retries by re-cloning its persisted source; its template
			// field is a pseudo-name, not a registry entry.
			...(failure.templateUrl
				? { templateUrl: failure.templateUrl }
				: { template: failure.template }),
		});
		await this.dismiss(id);
		return result;
	}
}
