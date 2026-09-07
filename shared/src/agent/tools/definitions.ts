import type { ToolDefinition } from '../client.ts';

export const toolDefinitions: ToolDefinition[] = [
	{
		function: {
			description: 'Read the contents of a file. Returns numbered lines.',
			name: 'read_file',
			parameters: {
				properties: {
					limit: { description: 'Maximum number of lines to read', type: 'number' },
					offset: { description: 'Starting line number, 0-based', type: 'number' },
					path: {
						description: 'File path relative to working directory',
						type: 'string',
					},
				},
				required: ['path'],
				type: 'object',
			},
		},
		type: 'function',
	},
	{
		function: {
			description: 'Create a new file or completely overwrite an existing file.',
			name: 'write_file',
			parameters: {
				properties: {
					content: { description: 'Complete file content to write', type: 'string' },
					path: {
						description: 'File path relative to working directory',
						type: 'string',
					},
				},
				required: ['path', 'content'],
				type: 'object',
			},
		},
		type: 'function',
	},
	{
		function: {
			description: 'Replace the first exact occurrence of old_string with new_string.',
			name: 'edit_file',
			parameters: {
				properties: {
					new_string: { description: 'Replacement string', type: 'string' },
					old_string: { description: 'Exact string to replace', type: 'string' },
					path: {
						description: 'File path relative to working directory',
						type: 'string',
					},
				},
				required: ['path', 'old_string', 'new_string'],
				type: 'object',
			},
		},
		type: 'function',
	},
	{
		function: {
			description:
				'Execute a bash command and return stdout, stderr, and exit code. Use for git operations, package manager commands, build tools, and system commands.',
			name: 'bash',
			parameters: {
				properties: {
					command: { description: 'The bash command to execute', type: 'string' },
					timeout_ms: {
						description:
							'Timeout in milliseconds (default 300000 = 5 minutes). Raise it for long builds or full test suites instead of letting them be killed mid-run.',
						type: 'number',
					},
				},
				required: ['command'],
				type: 'object',
			},
		},
		type: 'function',
	},
	{
		function: {
			description: 'Find files matching a glob pattern. Returns file paths.',
			name: 'glob',
			parameters: {
				properties: {
					path: {
						description: 'Directory relative to working directory',
						type: 'string',
					},
					pattern: { description: 'Glob pattern', type: 'string' },
				},
				required: ['pattern'],
				type: 'object',
			},
		},
		type: 'function',
	},
	{
		function: {
			description:
				'Search file contents for a regex pattern. Returns matching lines with file paths and line numbers.',
			name: 'grep',
			parameters: {
				properties: {
					include: { description: 'File glob filter', type: 'string' },
					path: {
						description: 'File or directory to search',
						type: 'string',
					},
					pattern: { description: 'Regex pattern to search for', type: 'string' },
				},
				required: ['pattern'],
				type: 'object',
			},
		},
		type: 'function',
	},
	{
		function: {
			description: 'List the contents of a directory. Directories have a trailing slash.',
			name: 'list_directory',
			parameters: {
				properties: {
					path: {
						description: 'Directory path relative to working directory',
						type: 'string',
					},
				},
				required: ['path'],
				type: 'object',
			},
		},
		type: 'function',
	},
];
