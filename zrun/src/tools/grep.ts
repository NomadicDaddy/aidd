const MAX_OUTPUT_CHARS = 50_000;

// Directories to always exclude from grep searches
const EXCLUDED_DIRS = [
	'node_modules',
	'.git',
	'dist',
	'build',
	'.next',
	'.automaker/iterations',
	'data',
	'coverage',
	'.cache',
	'vendor',
];

interface GrepArgs {
	pattern: string;
	path?: string;
	include?: string;
}

export async function grep(args: GrepArgs, cwd: string): Promise<string> {
	const searchPath = args.path ?? '.';

	// Build rg command with sensible defaults
	const rgArgs = [
		'rg',
		'--no-heading',
		'--line-number',
		'--max-count',
		'50',
		'--max-filesize',
		'256K',
	];

	// Exclude junk directories
	for (const dir of EXCLUDED_DIRS) {
		rgArgs.push('--glob', `!${dir}`);
	}

	if (args.include) {
		rgArgs.push('--glob', args.include);
	}

	rgArgs.push('--', args.pattern, searchPath);

	try {
		const proc = Bun.spawn(rgArgs, {
			cwd,
			stdout: 'pipe',
			stderr: 'pipe',
			env: { ...process.env },
		});

		const stdout = await new Response(proc.stdout).text();
		const stderr = await new Response(proc.stderr).text();
		const exitCode = await proc.exited;

		if (exitCode === 1) {
			return 'No matches found.';
		}

		if (exitCode !== 0 && exitCode !== 1) {
			if (stderr.includes('not found') || stderr.includes('No such file')) {
				return await grepFallback(args, cwd);
			}
			return `ERROR: grep failed: ${stderr}`;
		}

		return truncateOutput(stdout.trim());
	} catch {
		return await grepFallback(args, cwd);
	}
}

async function grepFallback(args: GrepArgs, cwd: string): Promise<string> {
	const grepArgs = ['grep', '-rn', '--max-count=50'];

	// Exclude junk directories
	for (const dir of EXCLUDED_DIRS) {
		grepArgs.push(`--exclude-dir=${dir}`);
	}

	if (args.include) {
		grepArgs.push(`--include=${args.include}`);
	}
	grepArgs.push('--', args.pattern, args.path ?? '.');

	try {
		const proc = Bun.spawn(grepArgs, {
			cwd,
			stdout: 'pipe',
			stderr: 'pipe',
			env: { ...process.env },
		});

		const stdout = await new Response(proc.stdout).text();
		await proc.exited;

		return truncateOutput(stdout.trim()) || 'No matches found.';
	} catch (err) {
		return `ERROR: grep fallback failed: ${err instanceof Error ? err.message : String(err)}`;
	}
}

function truncateOutput(result: string): string {
	if (result.length > MAX_OUTPUT_CHARS) {
		// Count lines in the truncated portion
		const truncated = result.substring(0, MAX_OUTPUT_CHARS);
		const lineCount = truncated.split('\n').length;
		return (
			truncated +
			`\n... (output truncated at ${MAX_OUTPUT_CHARS} chars, showed ~${lineCount} lines)`
		);
	}
	return result;
}
