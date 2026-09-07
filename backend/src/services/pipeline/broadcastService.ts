import type { PipelineSessionStatus } from '../../types.ts';
import type { WebSocketHub } from '../../webSocketHub.ts';
import type { PipelineTopLevelProgress } from './types.ts';

export class BroadcastService {
	private readonly hub: WebSocketHub;

	constructor(hub: WebSocketHub) {
		this.hub = hub;
	}

	sessionProgress(sessionId: string, progress: PipelineTopLevelProgress): void {
		this.hub.broadcast({
			payload: { sessionId, ...progress },
			type: 'pipeline_progress',
		});
	}

	sessionStatus(sessionId: string, status: PipelineSessionStatus): void {
		this.hub.broadcast({
			payload: { sessionId, status },
			type: 'pipeline_status',
		});
	}
}
