import { maxToolResultChars } from './constants.ts';
import {
	editWorkspaceFile,
	globWorkspace,
	listWorkspaceDirectory,
	readWorkspaceFile,
	writeWorkspaceFile,
} from './filesystem.ts';
import { grepWorkspace, runBash } from './shell.ts';

export { toolDefinitions } from './definitions.ts';

export async function executeTool(
	name: string,
	rawArgs: string,
	cwd: string,
	simulation = false,
): Promise<string> {
	let args: Record<string, unknown>;
	try {
		args = JSON.parse(rawArgs) as Record<string, unknown>;
	} catch {
		return `ERROR: Failed to parse tool arguments as JSON: ${rawArgs}`;
	}

	if (simulation) {
		const result = simulateMutationTool(name, args);
		if (result !== null) return result;
	}

	let result: string;
	try {
		result = await runTool(name, args, cwd);
	} catch (error) {
		result = `ERROR: ${name} threw: ${error instanceof Error ? error.message : String(error)}`;
	}
	return result.length > maxToolResultChars
		? `${result.substring(0, maxToolResultChars)}\n\n... OUTPUT TRUNCATED (${result.length} chars total)`
		: result;
}

async function runTool(name: string, args: Record<string, unknown>, cwd: string): Promise<string> {
	switch (name) {
		case 'bash':
			return await runBash(args, cwd);
		case 'edit_file':
			return editWorkspaceFile(args, cwd);
		case 'glob':
			return await globWorkspace(args, cwd);
		case 'grep':
			return await grepWorkspace(args, cwd);
		case 'list_directory':
			return listWorkspaceDirectory(args, cwd);
		case 'read_file':
			return readWorkspaceFile(args, cwd);
		case 'write_file':
			return writeWorkspaceFile(args, cwd);
		default:
			return `ERROR: Unknown tool: ${name}`;
	}
}

function simulateMutationTool(name: string, args: Record<string, unknown>): null | string {
	if (name === 'write_file') {
		return `SUCCESS: [SIMULATED] File not written: ${String(args.path ?? '<unknown>')}`;
	}
	if (name === 'edit_file') {
		return `SUCCESS: [SIMULATED] File not edited: ${String(args.path ?? '<unknown>')}`;
	}
	if (name === 'bash') {
		return `SUCCESS: [SIMULATED] Command not executed: ${String(args.command ?? '')}\nstdout: (simulated)\nstderr:\nexit code: 0`;
	}
	return null;
}
