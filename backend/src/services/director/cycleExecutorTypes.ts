import type {
	DirectAiMeta,
	DirectorCycleStage,
	DirectorOutput,
	DirectorProfileRecord,
} from 'aidd-shared';

import type { WebDatabase } from '../../db/client.ts';
import type { DirectAiRunner } from '../directAiService.ts';
import type { SuggestionHistoryEntry } from './suggestionHistory.ts';
import type { DirectorConfigProvider, DirectorOutputStatus, FleetSummary } from './types.ts';

import { type RunService } from '../runService.ts';
import { type DirectorChatService } from './chatService.ts';
import { type DirectorProfileService } from './profileService.ts';

export interface CycleContextDocument {
	directive: null | string;
	profile: DirectorProfileRecord;
	recentMessages: { content: string; createdAt: string; role: string }[];
	/** Prior cycles' suggestions with their outcomes (collapsed, occurrence-counted) so the
	 * director stops regenerating items the operator already dismissed. Keep in sync with
	 * DirectCycleContextDocument in directCycleNormalizer.ts. */
	recentSuggestions: SuggestionHistoryEntry[];
	sessionId: null | string;
}

export type CycleContext =
	| {
			context: CycleContextDocument;
			contextPath: string;
			profile: DirectorProfileRecord;
			sessionId: string | undefined;
	  }
	| undefined;

export interface CycleExecutorDeps {
	/**
	 * Fired once the cycle's results are safely on disk, so the Director can start the work it
	 * just proposed. Deliberately after persistence and never inside it: a launch that fails must
	 * not be able to spoil a cycle that already succeeded.
	 */
	autoLaunchSuggestions: (cycleId: string) => Promise<void>;
	chatService: DirectorChatService;
	db: WebDatabase;
	deleteActiveStage: (cycleId: string) => void;
	directAiService: DirectAiRunner;
	disposed: () => boolean;
	getConfig: DirectorConfigProvider;
	persistCycleResult: (
		cycleId: string,
		fleetSummary: FleetSummary,
		output: DirectorOutput | undefined,
		exitCode: number,
		outputStatus: DirectorOutputStatus | undefined,
		failureReason?: null | string,
	) => Promise<void>;
	profileService: DirectorProfileService;
	readCycleOutput: (
		outputPath: string,
	) => Promise<{ output: DirectorOutput | undefined; outputStatus: DirectorOutputStatus }>;
	runService: RunService;
	setCycleStage: (
		cycleId: string,
		stage: DirectorCycleStage,
		directAiMeta?: DirectAiMeta | null,
	) => void;
}

// Result of the direct-AI fast path. On fallback we carry the direct-AI error (if
// any) so that, should the CLI path ALSO fail, the cycle's failureReason can name
// the original cause instead of losing it to a log-only warning.
export type DirectCycleResult =
	{ directAiError: null | string; output: null } | { output: DirectorOutput };
