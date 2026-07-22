import type {
	ChatAgentAction,
	DirectorChatMessageInput,
	DirectorChatMessageRecord,
	DirectorChatSessionRecord,
} from 'aidd-shared';

import { desc, eq } from 'drizzle-orm';

import type { WebDatabase } from '../../db/client.ts';
import type { DirectAiRunner } from '../directAiService.ts';
import type { DirectorFleetSummaryService } from './fleetSummaryService.ts';
import type { DirectorProfileService } from './profileService.ts';
import type {
	BackendFactory,
	DirectorConfigProvider,
	DirectorRecipeSummary,
	FleetSummary,
	ProfileRow,
} from './types.ts';

import { directorChatMessages, directorChatSessions } from '../../db/schema.ts';
import { type DirectorChatAgent, NoToolCallingProviderError } from './chatAgent.ts';
import { runTextOnlyChatTurn } from './chatTextTurn.ts';
import {
	cleanText,
	createChatMessageId,
	createChatSessionId,
	mapChatMessage,
	maxChatContextMessages,
	maxChatMessageLength,
	serializeChatActions,
	titleFromContent,
} from './helpers.ts';

export class DirectorChatService {
	private readonly db: WebDatabase;
	private readonly getConfig: DirectorConfigProvider;
	private readonly backendFactory: BackendFactory;
	private readonly directAiService: DirectAiRunner;
	private readonly profileService: DirectorProfileService;
	private readonly fleetSummaryService: DirectorFleetSummaryService;
	private readonly chatAgent: DirectorChatAgent;
	private readonly listRecipes: () => Promise<DirectorRecipeSummary[]>;

	constructor(
		db: WebDatabase,
		getConfig: DirectorConfigProvider,
		backendFactory: BackendFactory,
		directAiService: DirectAiRunner,
		profileService: DirectorProfileService,
		fleetSummaryService: DirectorFleetSummaryService,
		chatAgent: DirectorChatAgent,
		listRecipes: () => Promise<DirectorRecipeSummary[]> = async () => []
	) {
		this.db = db;
		this.getConfig = getConfig;
		this.backendFactory = backendFactory;
		this.directAiService = directAiService;
		this.profileService = profileService;
		this.fleetSummaryService = fleetSummaryService;
		this.chatAgent = chatAgent;
		this.listRecipes = listRecipes;
	}

	private allowChatFileEdits(): boolean {
		return this.getConfig().director?.chat?.allowFileEdits === true;
	}

	async listChatSessions(): Promise<DirectorChatSessionRecord[]> {
		await this.profileService.ensureDefaultProfile();
		return await this.db
			.select()
			.from(directorChatSessions)
			.orderBy(desc(directorChatSessions.updatedAt))
			.limit(20);
	}

	async createChatSession(title?: string): Promise<DirectorChatSessionRecord> {
		const profile = await this.profileService.ensureDefaultProfile();
		const now = Date.now();
		const session: typeof directorChatSessions.$inferInsert = {
			createdAt: now,
			id: createChatSessionId(),
			profileId: profile.id,
			title: cleanText(title, 120) || 'Director Chat',
			updatedAt: now,
		};
		await this.db.insert(directorChatSessions).values(session);
		return session;
	}

	async deleteChatSession(sessionId: string): Promise<void> {
		await this.requireChatSession(sessionId);
		await this.db.delete(directorChatSessions).where(eq(directorChatSessions.id, sessionId));
	}

	async listChatMessages(sessionId: string): Promise<DirectorChatMessageRecord[]> {
		await this.requireChatSession(sessionId);
		const rows = await this.db
			.select()
			.from(directorChatMessages)
			.where(eq(directorChatMessages.sessionId, sessionId))
			.orderBy(directorChatMessages.createdAt)
			.limit(200);
		return rows.map(mapChatMessage);
	}

	async sendChatMessage(
		sessionId: string,
		input: DirectorChatMessageInput
	): Promise<{
		assistant: DirectorChatMessageRecord;
		user: DirectorChatMessageRecord;
	}> {
		const session = await this.requireChatSession(sessionId);
		const profile = await this.profileService.ensureDefaultProfile();
		const content = cleanText(input.content, maxChatMessageLength);
		if (!content) throw new Error('Director chat message cannot be empty.');
		const now = Date.now();
		const user = await this.insertChatMessage({
			content,
			createdAt: now,
			role: 'user',
			sessionId: session.id,
		});
		if (session.title === 'Director Chat') {
			await this.db
				.update(directorChatSessions)
				.set({ title: titleFromContent(content), updatedAt: now })
				.where(eq(directorChatSessions.id, session.id));
		} else {
			await this.touchChatSession(session.id);
		}
		const recentMessages = await this.recentChatMessages(session.id);
		const [fleetSummary, recipeCatalog] = await Promise.all([
			this.fleetSummaryService.getFleetSummary(),
			this.listRecipes(),
		]);
		let turn: { actions: ChatAgentAction[]; text: string };
		try {
			turn = await this.runChatTurn(
				profile,
				fleetSummary,
				recentMessages,
				session.id,
				recipeCatalog
			);
		} catch (err) {
			// The user message is already persisted. Persist a system message so the
			// user sees their message AND an explanation of why no reply came, rather
			// than the message silently disappearing from the conversation.
			const reason = err instanceof Error ? err.message : String(err);
			await this.insertChatMessage({
				content: `Could not generate a reply: ${reason}`,
				createdAt: Date.now(),
				role: 'system',
				sessionId: session.id,
			});
			throw err;
		}
		const assistant = await this.insertChatMessage({
			actions: turn.actions,
			content: turn.text,
			createdAt: Date.now(),
			role: 'assistant',
			sessionId: session.id,
		});
		await this.touchChatSession(session.id);
		return { assistant, user };
	}

	async recentChatMessages(sessionId: string): Promise<DirectorChatMessageRecord[]> {
		const rows = await this.db
			.select()
			.from(directorChatMessages)
			.where(eq(directorChatMessages.sessionId, sessionId))
			.orderBy(desc(directorChatMessages.createdAt))
			.limit(maxChatContextMessages);
		return rows.reverse().map(mapChatMessage);
	}

	async insertChatMessage(input: {
		actions?: ChatAgentAction[];
		content: string;
		createdAt: number;
		cycleId?: string;
		role: 'assistant' | 'system' | 'user';
		sessionId: string;
	}): Promise<DirectorChatMessageRecord> {
		const actions = input.actions ?? [];
		const message: DirectorChatMessageRecord = {
			actions,
			content: input.content,
			createdAt: input.createdAt,
			cycleId: input.cycleId ?? null,
			id: createChatMessageId(),
			role: input.role,
			sessionId: input.sessionId,
		};
		await this.db.insert(directorChatMessages).values({
			actions: serializeChatActions(actions),
			content: message.content,
			createdAt: message.createdAt,
			cycleId: message.cycleId,
			id: message.id,
			role: message.role,
			sessionId: message.sessionId,
		});
		return message;
	}

	async touchChatSession(sessionId: string): Promise<void> {
		await this.db
			.update(directorChatSessions)
			.set({ updatedAt: Date.now() })
			.where(eq(directorChatSessions.id, sessionId));
	}

	private async requireChatSession(
		sessionId: string
	): Promise<typeof directorChatSessions.$inferSelect> {
		const session = (
			await this.db
				.select()
				.from(directorChatSessions)
				.where(eq(directorChatSessions.id, sessionId))
		)[0];
		if (!session) throw new Error(`Director chat session not found: ${sessionId}`);
		return session;
	}

	private async runChatTurn(
		profile: ProfileRow,
		fleetSummary: FleetSummary,
		messages: DirectorChatMessageRecord[],
		sessionId: string,
		recipeCatalog: DirectorRecipeSummary[]
	): Promise<{ actions: ChatAgentAction[]; text: string }> {
		if (this.directAiService.isSurfaceEnabled('directorChat')) {
			try {
				return await this.chatAgent.runTurn({
					allowFileEdits: this.allowChatFileEdits(),
					fleetSummary,
					messages,
					profile,
					recipeCatalog,
					sessionId,
				});
			} catch (err) {
				// No tool-calling provider resolved: fall through to the text-only path so the user
				// still gets a reply (or the precise misconfiguration err from completeText).
				if (!(err instanceof NoToolCallingProviderError)) throw err;
			}
		}
		const text = await runTextOnlyChatTurn(
			{
				backendFactory: this.backendFactory,
				directAiService: this.directAiService,
				getConfig: this.getConfig,
			},
			profile,
			fleetSummary,
			messages,
			recipeCatalog
		);
		return { actions: [], text };
	}
}
