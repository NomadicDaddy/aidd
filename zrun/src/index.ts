import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadConfig, parseModelArg } from './config';
import { initClient } from './client';
import { buildSystemPrompt } from './system-prompt';
import { runAgentLoop } from './agent-loop';
import type { ChatMessage } from './types';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const cwd = process.cwd();

// Load configuration
const config = loadConfig(scriptDir);

// Override model from CLI args if provided
const modelOverride = parseModelArg(process.argv.slice(2));
if (modelOverride) {
	config.model = modelOverride;
}

// Initialize API client
initClient(config);

// Read prompt from stdin
const stdinChunks: string[] = [];
const reader = Bun.stdin.stream().getReader();

while (true) {
	const { done, value } = await reader.read();
	if (done) break;
	stdinChunks.push(new TextDecoder().decode(value));
}

const prompt = stdinChunks.join('');
if (!prompt.trim()) {
	console.error('ERROR: No prompt received on stdin.');
	process.exit(1);
}

process.stdout.write(`[zrun] Using model: ${config.model}\n`);
process.stdout.write(`[zrun] Working directory: ${cwd}\n`);
process.stdout.write(`[zrun] Max turns: ${config.maxTurns}\n\n`);

// Build conversation
const messages: ChatMessage[] = [
	{ role: 'system', content: buildSystemPrompt(cwd) },
	{ role: 'user', content: prompt },
];

// Run the agent loop
const stats = await runAgentLoop(messages, cwd, config.maxTurns);

process.stdout.write(
	`\n[zrun] Session complete: ${stats.turns} turns, ` +
		`${stats.totalTokens.toLocaleString()} total tokens ` +
		`(prompt: ${stats.totalPromptTokens.toLocaleString()}, ` +
		`completion: ${stats.totalCompletionTokens.toLocaleString()}, ` +
		`cached: ${stats.totalCachedTokens.toLocaleString()})\n`
);

process.exit(0);
