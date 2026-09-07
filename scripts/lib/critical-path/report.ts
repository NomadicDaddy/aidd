/**
 * Terminal formatting shared by the critical-path gate and its budget check.
 *
 * Extracted from scripts/check-critical-path.ts (max-lines split).
 */

// ANSI color codes
const colors: Record<string, string> = {
	blue: '\x1b[34m',
	cyan: '\x1b[36m',
	green: '\x1b[32m',
	red: '\x1b[31m',
	reset: '\x1b[0m',
	yellow: '\x1b[33m',
};

export function log(message: string, color = 'reset'): void {
	console.log(`${colors[color] ?? colors['reset']}${message}${colors['reset']}`);
}

export function kb(bytes: number): string {
	return `${(bytes / 1024).toFixed(2)} KB`;
}
