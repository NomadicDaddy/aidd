import type { PipelineSessionStatus } from '../../types.ts';
import type { WebSocketHub } from '../../webSocketHub.ts';

export class BroadcastService {
	private readonly hub: WebSocketHub;

	constructor(hub: WebSocketHub) {
		this.hub = hub;
	}

	sessionStatus(sessionId: string, status: PipelineSessionStatus): void {
		this.hub.broadcast({
			payload: { sessionId, status },
			type: 'pipeline_status',
		});
	}
}
