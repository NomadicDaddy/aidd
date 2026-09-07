import type { DirectAiMeta, DirectorCycleStage } from 'aidd-shared';

import type { DirectAiRunner } from '../directAiService.ts';
import type { RunService } from '../runService.ts';
import type { CycleExecutorDeps } from './cycleExecutorTypes.ts';
import type { CyclePersistenceDeps } from './cyclePersistence.ts';
import type { DirectorProfileService } from './profileService.ts';

import { persistCycleResult, readCycleOutput } from './cyclePersistence.ts';

/**
 * Everything a running cycle reaches for, in one object. The executor and the persistence layer each
 * declare their own narrower slice, so without this the service would list the same collaborators
 * twice and grow a field every time either slice does.
 */
export interface CycleCollaborators extends CyclePersistenceDeps {
	autoLaunchSuggestions: (cycleId: string) => Promise<void>;
	deleteActiveStage: (cycleId: string) => void;
	directAiService: DirectAiRunner;
	disposed: () => boolean;
	profileService: DirectorProfileService;
	runService: RunService;
	setCycleStage: (
		cycleId: string,
		stage: DirectorCycleStage,
		directAiMeta?: DirectAiMeta | null,
	) => void;
}

/**
 * Bind the executor's dependencies, including the persistence calls it makes on its way out.
 * @param collaborators Everything the cycle reaches for.
 * @returns The slice the executor declares.
 */
export function buildExecutorDeps(collaborators: CycleCollaborators): CycleExecutorDeps {
	return {
		autoLaunchSuggestions: collaborators.autoLaunchSuggestions,
		chatService: collaborators.chatService,
		db: collaborators.db,
		deleteActiveStage: collaborators.deleteActiveStage,
		directAiService: collaborators.directAiService,
		disposed: collaborators.disposed,
		getConfig: collaborators.getConfig,
		persistCycleResult: (
			cycleId,
			fleetSummary,
			output,
			exitCode,
			outputStatus,
			failureReason,
		) =>
			persistCycleResult(
				collaborators,
				cycleId,
				fleetSummary,
				output,
				exitCode,
				outputStatus,
				failureReason,
			),
		profileService: collaborators.profileService,
		readCycleOutput,
		runService: collaborators.runService,
		setCycleStage: collaborators.setCycleStage,
	};
}
