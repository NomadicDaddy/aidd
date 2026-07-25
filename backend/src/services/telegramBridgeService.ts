import type { ResolvedConfig, ResolvedTelegramBridgeConfig } from 'aidd-shared/config';

import {
	createBridgeHandler,
	createTelegramClient,
	runBridgeLoop,
	type TelegramClient,
} from '../bridge/telegram.ts';
import { createApiClient } from '../channels/apiClient.ts';
import { webLogger } from '../logger.ts';

type BridgeLogger = Pick<typeof webLogger, 'error' | 'info' | 'warn'>;

interface TelegramBridgeServiceDeps {
	apiClientFactory?: typeof createApiClient;
	logger?: BridgeLogger;
	runLoop?: typeof runBridgeLoop;
	telegramClientFactory?: typeof createTelegramClient;
}

function configKey(telegram: ResolvedTelegramBridgeConfig): string {
	return JSON.stringify({
		allowedChatIds: telegram.allowedChatIds,
		botToken: telegram.botToken,
	});
}

export class TelegramBridgeService {
	private activeKey: null | string = null;
	private controller: AbortController | null = null;
	private loop: null | Promise<void> = null;
	// Serializes updateConfig/stop transitions. Settings PUTs can land concurrently;
	// without the chain two updates could interleave at the stop await and start two
	// long-poll loops — the first becomes unstoppable and dueling getUpdates pollers
	// on one bot token trigger Telegram 409 conflicts.
	private pending: Promise<void> = Promise.resolve();
	private readonly apiClientFactory: typeof createApiClient;
	private readonly logger: BridgeLogger;
	private readonly runLoop: typeof runBridgeLoop;
	private readonly telegramClientFactory: typeof createTelegramClient;

	constructor(deps: TelegramBridgeServiceDeps = {}) {
		this.apiClientFactory = deps.apiClientFactory ?? createApiClient;
		this.logger = deps.logger ?? webLogger;
		this.runLoop = deps.runLoop ?? runBridgeLoop;
		this.telegramClientFactory = deps.telegramClientFactory ?? createTelegramClient;
	}

	updateConfig(config: ResolvedConfig): Promise<void> {
		return this.enqueue(() => this.applyConfig(config));
	}

	stop(): Promise<void> {
		return this.enqueue(() => this.stopLoop());
	}

	private enqueue(transition: () => Promise<void>): Promise<void> {
		const next = this.pending.then(transition);
		this.pending = next.catch(() => {});
		return next;
	}

	private async applyConfig(config: ResolvedConfig): Promise<void> {
		const telegram = config.channels?.telegram;
		if (!telegram) {
			await this.stopLoop();
			return;
		}
		const nextKey = configKey(telegram);
		if (nextKey === this.activeKey) return;
		await this.stopLoop();
		this.start(config, telegram, nextKey);
	}

	private async stopLoop(): Promise<void> {
		const controller = this.controller;
		const loop = this.loop;
		this.activeKey = null;
		this.controller = null;
		this.loop = null;
		controller?.abort();
		await loop;
	}

	private start(
		config: ResolvedConfig,
		telegram: ResolvedTelegramBridgeConfig,
		nextKey: string,
	): void {
		const web = config.web;
		if (!web) {
			this.logger.warn('Telegram bridge configured, but web config is unavailable');
			return;
		}
		if (telegram.allowedChatIds.length === 0) {
			this.logger.warn(
				'channels.telegram.allowedChatIds is empty; every Telegram message will be ignored',
			);
		}
		const api = this.apiClientFactory(web);
		const telegramClient: TelegramClient = this.telegramClientFactory(telegram.botToken);
		const handler = createBridgeHandler({
			allowedChatIds: telegram.allowedChatIds,
			api,
			telegram: telegramClient,
		});
		const controller = new AbortController();
		this.activeKey = nextKey;
		this.controller = controller;
		this.logger.info(
			{ allowedChatIds: telegram.allowedChatIds, baseUrl: api.baseUrl },
			'aidd Telegram bridge started',
		);
		this.loop = this.runLoop({
			handler,
			signal: controller.signal,
			telegram: telegramClient,
		})
			.catch((err) => {
				this.logger.error({ err }, 'aidd Telegram bridge stopped after an error');
			})
			.finally(() => {
				if (this.controller === controller) {
					this.activeKey = null;
					this.controller = null;
					this.loop = null;
				}
			});
	}
}
