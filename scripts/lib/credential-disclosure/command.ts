import { tokenizeShell } from '../../../shared/src/agent/tools/shell-policy-tokens.ts';
import { credentialLabel } from './paths.ts';

/** Keep shell separators outside quoted arguments; a search expression is one argument. */
function pipelines(command: string): string[][] {
	const result: string[][] = [];
	let pipeline: string[] = [];
	let quote: string | undefined;
	let current = '';
	for (let index = 0; index < command.length; index++) {
		const character = command[index]!;
		if (quote) {
			current += character;
			if (character === quote) quote = undefined;
		} else if (character === '"' || character === "'") {
			quote = character;
			current += character;
		} else if (';|&\n'.includes(character)) {
			pipeline.push(current);
			current = '';
			if (character !== '|' || command[index + 1] === '|') {
				result.push(pipeline);
				pipeline = [];
				if (command[index + 1] === character) index++;
			}
		} else current += character;
	}
	pipeline.push(current);
	result.push(pipeline);
	return result;
}

/** Search needles and glob exclusions name text, not files whose contents were returned. */
function searchOperands(tokens: string[]): string[] {
	const operands: string[] = [];
	let hasPattern = false;
	let positional = false;
	for (let index = 0; index < tokens.length; index++) {
		const token = tokens[index]!;
		if (!positional && token === '--') {
			positional = true;
			continue;
		}
		if (!positional && ['--file', '--regexp', '-e', '-f'].includes(token)) {
			hasPattern = true;
			if (token === '-f' || token === '--file') operands.push(tokens[index + 1] ?? '');
			index++;
			continue;
		}
		if (
			!positional &&
			['--exclude', '--exclude-dir', '--glob', '--iglob', '--include', '-g'].includes(token)
		) {
			index++;
			continue;
		}
		if (!positional && token.startsWith('-')) {
			const patternFile = /^(?:--file=|-f)(.+)$/.exec(token)?.[1];
			if (patternFile) {
				hasPattern = true;
				operands.push(patternFile);
			}
			if (/^(?:-e.|--regexp=)/.test(token)) hasPattern = true;
			continue;
		}
		if (!hasPattern) hasPattern = true;
		else operands.push(token);
	}
	return operands;
}

function gitArguments(tokens: string[]): string[] {
	let index = 0;
	while (tokens[index]?.startsWith('-')) {
		index += ['--config-env', '--git-dir', '--namespace', '--work-tree', '-c', '-C'].includes(
			tokens[index]!,
		)
			? 2
			: 1;
	}
	return tokens.slice(index);
}

/** Explicit filters used for dotenv previews before output reaches the model. */
function filtersDotenvValues(executable: string, tokens: string[], stdin = false): boolean {
	if (executable === 'sed') {
		const args = [...tokens];
		if (args[0] === '-E' || args[0] === '-r') args.shift();
		if (args[0] === '-e') args.shift();
		return (
			args.length === (stdin ? 1 : 2) &&
			/^s\/=.\*\/=(?:<(?:redacted|set)>|\[REDACTED\])\/$/.test(args[0]!) &&
			(stdin || credentialLabel(args[1]!) === 'dotenv')
		);
	}
	if (executable !== 'cut') return false;
	const args: string[] = [];
	for (let index = 0; index < tokens.length; index++) {
		const token = tokens[index]!;
		args.push(token === '-d' || token === '-f' ? token + (tokens[++index] ?? '') : token);
	}
	return (
		args.length === (stdin ? 2 : 3) &&
		args.includes('-d=') &&
		args.includes('-f1') &&
		(stdin || credentialLabel(args.at(-1) ?? '') === 'dotenv')
	);
}

function numericPortPreview(tokens: string[], output: unknown): boolean {
	if (typeof output !== 'string' || tokens.length !== 4) return false;
	const path = tokens[tokens.findIndex((token) => token.toLowerCase() === '-path') + 1];
	const pattern = tokens[tokens.findIndex((token) => token.toLowerCase() === '-pattern') + 1];
	const name = /^\^([A-Z][A-Z0-9_]*_PORT)=$/.exec(pattern ?? '')?.[1];
	if (!name || credentialLabel(path ?? '') !== 'dotenv') return false;
	const matches = [
		...output.matchAll(new RegExp(`^.*\\.env[^\\r\\n:]*:\\d+:\\s*${name}=([^\\r\\n]*)$`, 'gm')),
	];
	return (
		matches.length > 0 &&
		matches.every((match) => /^\d{1,5}$/.test(match[1] ?? '') && Number(match[1]) <= 65535)
	);
}

export function commandCredentialLabel(
	command: string,
	returnedOutput?: unknown,
): string | undefined {
	for (const pipeline of pipelines(command)) {
		const output = tokenizeShell(pipeline.at(-1) ?? '').map((token) => token.text);
		const input = tokenizeShell(pipeline[0] ?? '')[0]?.text.toLowerCase();
		const filteredPipeline =
			pipeline.length === 2 &&
			['cat', 'get-content', 'grep', 'rg', 'sed'].includes(input ?? '') &&
			!/[<>]/.test((pipeline[0] ?? '').replace(/2\s*>\s*\/dev\/null/g, '')) &&
			filtersDotenvValues(output[0] ?? '', output.slice(1), true);
		for (const segment of pipeline) {
			const tokens = tokenizeShell(segment).map((token) => token.text);
			const executable = tokens.shift()?.toLowerCase();
			if (!executable) continue;
			const expandsCommand =
				segment.includes('`') ||
				(segment.includes('$(') && tokens.some((token) => token.includes('$')));
			const program = executable.split(/[/\\]/).at(-1) ?? executable;
			if (
				[
					'bash',
					'cmd',
					'cmd.exe',
					'powershell',
					'powershell.exe',
					'pwsh',
					'pwsh.exe',
					'sh',
				].includes(program)
			) {
				const scriptIndex = tokens.findIndex((token) =>
					['-c', '-command', '/c'].includes(token.toLowerCase()),
				);
				if (scriptIndex >= 0) {
					const label = commandCredentialLabel(
						tokens.slice(scriptIndex + 1).join(' '),
						returnedOutput,
					);
					if (label) return label;
					continue;
				}
			}
			if (executable === 'select-string' && numericPortPreview(tokens, returnedOutput))
				continue;
			if (program === 'agent-browser' && !expandsCommand) {
				for (let index = tokens.length - 2; index >= 0; index--) {
					if (
						['--body', '--text'].includes(tokens[index]!) &&
						!tokens[index + 1]?.startsWith('@')
					)
						tokens.splice(index, 2);
				}
			}
			if (
				!expandsCommand &&
				[
					'[',
					'dir',
					'echo',
					'ls',
					'printf',
					'stat',
					'test',
					'test-path',
					'write-host',
					'write-output',
				].includes(executable)
			)
				continue;
			const gitArgs = executable === 'git' ? gitArguments(tokens) : [];
			if (!expandsCommand && gitArgs.length > 0) {
				if (['check-ignore', 'ls-files', 'status'].includes(gitArgs[0]!)) continue;
				if (
					gitArgs[0] === 'log' &&
					!gitArgs.some((token) => ['--patch', '-p'].includes(token))
				)
					continue;
			}
			const argumentsToCheck = ['grep', 'rg'].includes(executable)
				? searchOperands(tokens)
				: gitArgs[0] === 'grep'
					? searchOperands(gitArgs.slice(1))
					: tokens;
			for (const argument of argumentsToCheck) {
				const label = credentialLabel(argument);
				if (
					label === 'dotenv' &&
					(filteredPipeline || filtersDotenvValues(executable, tokens))
				)
					continue;
				if (label) return label;
			}
		}
	}
	return undefined;
}
