import type { CLIBackend, AgentEvent } from 'aidd-shared/backends/types';
import type { ResolvedConfig, ResolvedWebConfig } from 'aidd-shared/config';
import type { BackendName } from 'aidd-shared/plan/types';

import { monitorBackend } from 'aidd-shared/backends/monitor';
import { exitCodeFromEvents } from 'aidd-shared/orchestrator/result';
import { mkdir, readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import type {
	ProjectRecommendInputDto,
	ProjectRecommendMode,
	ProjectRecommendResultDto,
} from '../../types.ts';
import type { DirectAiRunner } from '../directAiService.ts';

import { assertAllowedPath } from '../../paths.ts';
import { HttpError } from '../errors.ts';
import { directoryExists, fileExists, hasAiddMetadata } from './discovery.ts';

interface RecommendContext {
	backendFactory: (name: BackendName) => CLIBackend;
	directAiService: DirectAiRunner;
	getConfig: () => ResolvedConfig & { web: ResolvedWebConfig };
}

const MAX_SPEC_BYTES = 4 * 1024;

// The parse-failure fallback is computed, never constant: a non-empty target must never
// fall back to fresh (that would scaffold over existing code), so it routes to ingest.
function fallbackFor(targetNonEmpty: boolean): ProjectRecommendResultDto {
	return targetNonEmpty
		? {
				mode: 'ingest',
				reasoning:
					'Model output could not be parsed; the target already contains files, so defaulting to ingest.',
			}
		: { mode: 'fresh', reasoning: 'Model output could not be parsed; defaulting to fresh.' };
}

// Best-effort: is the lane's resolved destination a non-empty/existing directory? Never
// throws — the advisor is advisory, so an unresolvable or out-of-roots path is treated as
// empty (the safe "fresh is allowed" state). A path with .aidd metadata or any entries
// counts as non-empty.
async function resolveTargetNonEmpty(
	allowedRoots: string[],
	input: ProjectRecommendInputDto
): Promise<boolean> {
	const candidate = input.path?.trim()
		? input.path.trim()
		: input.root?.trim()
			? join(input.root.trim(), input.name.trim())
			: undefined;
	if (!candidate) return false;
	let target: string;
	try {
		target = assertAllowedPath(allowedRoots, candidate);
	} catch {
		target = resolve(candidate);
	}
	if (await hasAiddMetadata(target)) return true;
	if (!(await directoryExists(target))) return false;
	try {
		return (await readdir(target)).length > 0;
	} catch {
		return false;
	}
}

async function loadSpecText(
	allowedRoots: string[],
	spec: ProjectRecommendInputDto['spec']
): Promise<string> {
	const trimmed = spec.value.trim();
	if (trimmed.length === 0) {
		throw new HttpError('Spec is required for recommendation', 400);
	}
	if (spec.kind === 'text') return trimmed;
	const resolved = assertAllowedPath(allowedRoots, trimmed);
	if (!(await fileExists(resolved))) {
		throw new HttpError(`Spec file does not exist: ${trimmed}`, 400);
	}
	return await readFile(resolved, 'utf8');
}

function buildPrompt(name: string, specText: string, targetNonEmpty: boolean): string {
	const truncated =
		specText.length > MAX_SPEC_BYTES
			? `${specText.slice(0, MAX_SPEC_BYTES)}\n…[truncated]`
			: specText;
	const options = [
		'  - "fresh"      Minimal scaffold. The aidd CLI initializes a bare .aidd metadata',
		'                 directory and lets the user shape the project freely. Best for',
		'                 small CLIs, single-purpose scripts, libraries, or anything where',
		'                 a full-stack web template would be wasted weight.',
		'  - "spernakit"  Full Spernakit scaffold (Bun + Elysia backend, React 19 + Vite',
		'                 frontend, Drizzle + SQLite, shadcn/ui, TanStack Query). Best for',
		'                 web apps with a frontend and backend, dashboards, internal tools,',
		'                 or anything that benefits from a batteries-included stack.',
	];
	if (targetNonEmpty) {
		options.push(
			'  - "ingest"     The selected directory already contains a codebase. Bring it under',
			'                 aidd management as-is (analyze, profile, audit) without scaffolding',
			'                 over it. Strongly prefer this when existing code is present.'
		);
	}
	const choices = targetNonEmpty ? '"fresh"|"spernakit"|"ingest"' : '"fresh"|"spernakit"';
	return [
		`You advise on how to start a project. Pick exactly one of ${targetNonEmpty ? 'three' : 'two'} options:`,
		'',
		...options,
		'',
		...(targetNonEmpty
			? [
					'The selected destination already contains files. Do not recommend scaffolding',
					'over existing code; prefer "ingest" unless the spec clearly describes a',
					'from-scratch rebuild.',
					'',
				]
			: []),
		`Project name: ${name}`,
		'Spec:',
		'```',
		truncated,
		'```',
		'',
		'Reply with a single JSON object on the final line, with no other text after it:',
		`{"mode":${choices},"reasoning":"one short sentence"}`,
	].join('\n');
}

function extractJsonObject(text: string): unknown {
	const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
	const candidates: string[] = [];
	if (fenced && fenced[1]) candidates.push(fenced[1].trim());
	const lastOpen = text.lastIndexOf('{');
	const lastClose = text.lastIndexOf('}');
	if (lastOpen !== -1 && lastClose > lastOpen) {
		candidates.push(text.slice(lastOpen, lastClose + 1));
	}
	for (const candidate of candidates) {
		try {
			return JSON.parse(candidate);
		} catch {
			// try next
		}
	}
	return null;
}

function parseRecommendation(reply: string, targetNonEmpty: boolean): ProjectRecommendResultDto {
	const parsed = extractJsonObject(reply);
	// 'ingest' is only a valid recommendation when the target actually has files; a model
	// that returns it for an empty target is ignored and the computed fallback applies.
	const allowed: ProjectRecommendMode[] = targetNonEmpty
		? ['fresh', 'spernakit', 'ingest']
		: ['fresh', 'spernakit'];
	if (
		parsed &&
		typeof parsed === 'object' &&
		'mode' in parsed &&
		typeof parsed.mode === 'string' &&
		(allowed as string[]).includes(parsed.mode)
	) {
		const mode = parsed.mode as ProjectRecommendMode;
		const reasoningRaw =
			'reasoning' in parsed && typeof parsed.reasoning === 'string'
				? parsed.reasoning.trim()
				: '';
		return {
			mode,
			reasoning: reasoningRaw || `Recommended ${mode} (no reasoning provided).`,
		};
	}
	return fallbackFor(targetNonEmpty);
}

export async function recommendProjectMode(
	ctx: RecommendContext,
	input: ProjectRecommendInputDto
): Promise<ProjectRecommendResultDto> {
	const config = ctx.getConfig();
	const name = input.name.trim();
	if (name.length === 0) {
		throw new HttpError('Project name is required for recommendation', 400);
	}
	const specText = await loadSpecText(config.web.allowedRoots, input.spec);
	const targetNonEmpty = await resolveTargetNonEmpty(config.web.allowedRoots, input);

	const cwd = join(config.web.dataDir, 'scratch', 'project-advisor');
	await mkdir(cwd, { recursive: true });
	const prompt = buildPrompt(name, specText, targetNonEmpty);
	if (ctx.directAiService.isSurfaceEnabled('projectAdvisor')) {
		const directReply = await ctx.directAiService.completeText({
			cwd,
			prompt,
			reasoningEffort: config.reasoningEffort,
			surface: 'projectAdvisor',
		});
		if (!directReply) return fallbackFor(targetNonEmpty);
		return parseRecommendation(directReply, targetNonEmpty);
	}

	const backend = ctx.backendFactory(config.cli);
	const events: AgentEvent[] = [];
	const controller = new AbortController();
	const promptInput = {
		cwd,
		heuristicMode: 'planning' as const,
		reasoningEffort: config.reasoningEffort,
		text: prompt,
		...(config.model ? { model: config.model } : {}),
	};
	for await (const event of monitorBackend(backend, promptInput, controller.signal, {
		idleNudgeTimeoutMs: config.idleNudgeTimeoutSeconds * 1000,
		idleTimeoutMs: config.idleTimeoutSeconds * 1000,
	})) {
		events.push(event);
	}
	const modifiedFiles = events.flatMap((event) =>
		event.type === 'done' ? event.filesModified : []
	);
	if (modifiedFiles.length > 0) {
		throw new HttpError('Advisor attempted to modify files; rejecting response', 500);
	}
	if (exitCodeFromEvents(events) !== 0) {
		throw new HttpError('Advisor backend exited with non-zero status', 500);
	}
	const reply = events
		.filter((event): event is Extract<AgentEvent, { type: 'assistant_text' }> => {
			return event.type === 'assistant_text';
		})
		.map((event) => event.chunk)
		.join('')
		.trim();
	if (!reply) return fallbackFor(targetNonEmpty);
	return parseRecommendation(reply, targetNonEmpty);
}
