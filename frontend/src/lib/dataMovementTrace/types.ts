export type DataTraceLayer = 'api' | 'backend' | 'socket' | 'state' | 'ui';
export type DataTraceCategory =
	'database' | 'event' | 'file' | 'metadata' | 'request' | 'response' | 'state';

export interface DataMovementTraceEvent {
	category: DataTraceCategory;
	durationMs?: number;
	layer: DataTraceLayer;
	operation: string;
	source?: string;
	status?: string;
	summary?: Record<string, unknown>;
	target?: string;
	timestamp?: string;
	traceId?: string;
}

export interface DataTraceStatus {
	buildMode: 'development' | 'production';
	enabled: boolean;
	source: 'config' | 'localStorage' | 'query';
	storageKey: string;
}

export type TraceStorage = {
	getItem(key: string): null | string;
	removeItem(key: string): void;
	setItem(key: string, value: string): void;
};

export type TraceDocument = {
	querySelector(selectors: string): { getAttribute(name: string): null | string } | null;
};

export type TraceWindow = {
	aiddTrace?: {
		disable(): void;
		enable(): void;
		status(): DataTraceStatus;
	};
	localStorage?: TraceStorage;
	location?: { href: string };
};

export type ImportMetaWithEnv = ImportMeta & { env?: { DEV?: boolean } };

export type TraceRecord = DataMovementTraceEvent & { timestamp: string };
