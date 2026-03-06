import type { ToolDefinition } from '../types';
import { readFile } from './read-file';
import { writeFile } from './write-file';
import { editFile } from './edit-file';
import { bash } from './bash';
import { glob } from './glob';
import { grep } from './grep';
import { listDirectory } from './list-directory';

export const toolDefinitions: ToolDefinition[] = [
	{
		type: 'function',
		function: {
			name: 'read_file',
			description: 'Read the contents of a file. Returns numbered lines.',
			parameters: {
				type: 'object',
				properties: {
					path: {
						type: 'string',
						description: 'File path (absolute or relative to working directory)',
					},
					offset: {
						type: 'number',
						description: 'Starting line number (0-based). Optional.',
					},
					limit: {
						type: 'number',
						description: 'Maximum number of lines to read. Optional.',
					},
				},
				required: ['path'],
			},
		},
	},
	{
		type: 'function',
		function: {
			name: 'write_file',
			description: 'Create a new file or completely overwrite an existing file.',
			parameters: {
				type: 'object',
				properties: {
					path: {
						type: 'string',
						description: 'File path (absolute or relative to working directory)',
					},
					content: { type: 'string', description: 'Complete file content to write' },
				},
				required: ['path', 'content'],
			},
		},
	},
	{
		type: 'function',
		function: {
			name: 'edit_file',
			description:
				'Edit a file by replacing the first occurrence of old_string with new_string. The old_string must match exactly including whitespace and indentation.',
			parameters: {
				type: 'object',
				properties: {
					path: {
						type: 'string',
						description: 'File path (absolute or relative to working directory)',
					},
					old_string: {
						type: 'string',
						description: 'Exact string to find and replace (first occurrence only)',
					},
					new_string: { type: 'string', description: 'Replacement string' },
				},
				required: ['path', 'old_string', 'new_string'],
			},
		},
	},
	{
		type: 'function',
		function: {
			name: 'bash',
			description:
				'Execute a bash command and return stdout, stderr, and exit code. Use for git operations, package manager commands, build tools, and system commands.',
			parameters: {
				type: 'object',
				properties: {
					command: { type: 'string', description: 'The bash command to execute' },
					timeout_ms: {
						type: 'number',
						description: 'Timeout in milliseconds (default: 120000 / 2 minutes)',
					},
				},
				required: ['command'],
			},
		},
	},
	{
		type: 'function',
		function: {
			name: 'glob',
			description: 'Find files matching a glob pattern. Returns file paths.',
			parameters: {
				type: 'object',
				properties: {
					pattern: {
						type: 'string',
						description: 'Glob pattern (e.g., "**/*.ts", "src/**/*.tsx")',
					},
					path: {
						type: 'string',
						description: 'Directory to search in (default: working directory)',
					},
				},
				required: ['pattern'],
			},
		},
	},
	{
		type: 'function',
		function: {
			name: 'grep',
			description:
				'Search file contents for a regex pattern. Returns matching lines with file paths and line numbers.',
			parameters: {
				type: 'object',
				properties: {
					pattern: { type: 'string', description: 'Regex pattern to search for' },
					path: {
						type: 'string',
						description: 'File or directory to search (default: working directory)',
					},
					include: {
						type: 'string',
						description: 'File glob filter (e.g., "*.ts", "*.{ts,tsx}")',
					},
				},
				required: ['pattern'],
			},
		},
	},
	{
		type: 'function',
		function: {
			name: 'list_directory',
			description: 'List the contents of a directory. Directories have a trailing /.',
			parameters: {
				type: 'object',
				properties: {
					path: {
						type: 'string',
						description: 'Directory path (absolute or relative to working directory)',
					},
				},
				required: ['path'],
			},
		},
	},
];

const MAX_TOOL_RESULT_CHARS = 100_000;

export async function executeTool(name: string, rawArgs: string, cwd: string): Promise<string> {
	let args: Record<string, unknown>;
	try {
		args = JSON.parse(rawArgs) as Record<string, unknown>;
	} catch {
		return `ERROR: Failed to parse tool arguments as JSON: ${rawArgs}`;
	}

	let result: string;
	switch (name) {
		case 'read_file':
			result = readFile(args as { path: string; offset?: number; limit?: number }, cwd);
			break;
		case 'write_file':
			result = writeFile(args as { path: string; content: string }, cwd);
			break;
		case 'edit_file':
			result = editFile(
				args as { path: string; old_string: string; new_string: string },
				cwd
			);
			break;
		case 'bash':
			result = await bash(args as { command: string; timeout_ms?: number }, cwd);
			break;
		case 'glob':
			result = await glob(args as { pattern: string; path?: string }, cwd);
			break;
		case 'grep':
			result = await grep(args as { pattern: string; path?: string; include?: string }, cwd);
			break;
		case 'list_directory':
			result = listDirectory(args as { path: string }, cwd);
			break;
		default:
			return `ERROR: Unknown tool: ${name}`;
	}

	// Global safety cap — no tool result should ever exceed this
	if (result.length > MAX_TOOL_RESULT_CHARS) {
		result =
			result.substring(0, MAX_TOOL_RESULT_CHARS) +
			`\n\n... OUTPUT TRUNCATED (${result.length.toLocaleString()} chars total, showing first ${MAX_TOOL_RESULT_CHARS.toLocaleString()})`;
	}

	return result;
}
