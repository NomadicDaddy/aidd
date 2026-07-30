import type { AgentEvent, CLIBackend, PromptInput } from './types.ts';

import { buildBackendCommand } from './commands.ts';
import { createClineBackendParser } from './parsers/cline.ts';
import { finalizeCodexBackend, parseCodexBackendLine } from './parsers/codex.ts';
import { finalizeGrokBackend, parseGrokLine } from './parsers/grok.ts';
import {
	finalizeOpencodeFamilyBackend,
	parseOpencodeFamilyLine,
} from './parsers/opencode-family.ts';
import { runProcessBackend } from './process.ts';

type ProcessCliBackendName = 'claude-code' | 'cline' | 'codex' | 'grok' | 'kilocode' | 'opencode';

export function createProcessCliBackend(name: ProcessCliBackendName): CLIBackend {
	return {
		idleDefaults: { killMs: 900_000, nudgeMs: 600_000 },
		name,
		runPrompt(input: PromptInput, signal: AbortSignal): AsyncIterable<AgentEvent> {
			const command = buildBackendCommand(name, input);
			const clineParser = name === 'cline' ? createClineBackendParser() : undefined;
			const parseOptions =
				clineParser !== undefined
					? clineParser
					: name === 'codex'
						? { finalize: finalizeCodexBackend, parseLine: parseCodexBackendLine }
						: name === 'grok'
							? { finalize: finalizeGrokBackend, parseLine: parseGrokLine }
							: name === 'kilocode' || name === 'opencode'
								? {
										finalize: finalizeOpencodeFamilyBackend,
										parseLine: parseOpencodeFamilyLine,
									}
								: {};
			// grok ignores piped stdin — its single-turn prompt must come from a file, so the
			// process runner writes the prompt to a tempfile and appends `--prompt-file <path>`.
			const promptViaFile = name === 'grok';
			return runProcessBackend(
				{ backend: name, promptViaFile, ...command, ...parseOptions },
				input,
				signal,
			);
		},
	};
}
