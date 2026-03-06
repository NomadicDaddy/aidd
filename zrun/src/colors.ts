/** ANSI color codes for terminal output */

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const MAGENTA = '\x1b[35m';
const CYAN = '\x1b[36m';

const BRIGHT_RED = '\x1b[91m';
const BRIGHT_GREEN = '\x1b[92m';
const BRIGHT_YELLOW = '\x1b[93m';
const BRIGHT_CYAN = '\x1b[96m';

export const c = {
	reset: RESET,

	// Structured output
	turn: (s: string) => `${BOLD}${BRIGHT_CYAN}${s}${RESET}`,
	usage: (s: string) => `${DIM}${s}${RESET}`,
	tool: (s: string) => `${BOLD}${YELLOW}${s}${RESET}`,
	toolArgs: (s: string) => `${DIM}${s}${RESET}`,
	result: (s: string) => `${GREEN}${s}${RESET}`,
	resultTrunc: (s: string) => `${DIM}${GREEN}${s}${RESET}`,
	model: (s: string) => `${s}`,

	// Status messages
	info: (s: string) => `${CYAN}${s}${RESET}`,
	warn: (s: string) => `${BOLD}${BRIGHT_YELLOW}${s}${RESET}`,
	error: (s: string) => `${BOLD}${BRIGHT_RED}${s}${RESET}`,
	success: (s: string) => `${BOLD}${BRIGHT_GREEN}${s}${RESET}`,
	nudge: (s: string) => `${MAGENTA}${s}${RESET}`,

	// Labels
	label: (s: string) => `${BOLD}${BLUE}${s}${RESET}`,
	value: (s: string) => `${s}`,
	dim: (s: string) => `${DIM}${s}${RESET}`,

	// Specific prefixes
	zrun: `${BOLD}${CYAN}[zrun]${RESET}`,
	toolPrefix: `${BOLD}${YELLOW}[tool]${RESET}`,
	resultPrefix: `${GREEN}[result]${RESET}`,
	usagePrefix: `${DIM}[usage]${RESET}`,
};
