import { parseArgs } from 'aidd-shared/args/index';
import { resolveConfig } from 'aidd-shared/config';
import { type BackendName, backendNames } from 'aidd-shared/plan/types';
import { formatRestUntil } from 'aidd-shared/provider-rest/decide';
import {
	clearProviderRest,
	readProviderRests,
	writeProviderRest,
} from 'aidd-shared/provider-rest/store';
import { resolveRootDir } from 'aidd-shared/runtime';

const USAGE = `Usage: aidd rest
       aidd rest set <backend> --until <when> [--reason <text>]
       aidd rest clear <backend>

Rest a backend: new runs do not start on it until the rest ends. A launch whose backend was
its default or standing configuration moves to the first substitute (providerRestSubstitutes);
a launch where a person picked the resting backend (--cli) is refused. Runs already going
are never switched. claude-code, codex and grok also rest on their own when a rate limit
reports its reset time.

<when> is a duration (90m, 2h), a local time (17:40, today or else tomorrow), or an ISO
date and time.

Backends: ${backendNames.join(', ')}

Exit codes: 0 done, 2 usage error.`;

/** Parses a rest end time; undefined when the text is none of the accepted forms. */
export function parseRestUntil(text: string, now: Date): Date | undefined {
	const duration = /^(\d+)\s*([mh])$/.exec(text.trim());
	if (duration) {
		const minutes = Number(duration[1]) * (duration[2] === 'h' ? 60 : 1);
		return new Date(now.getTime() + minutes * 60_000);
	}
	const clock = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
	if (clock) {
		const hours = Number(clock[1]);
		const minutes = Number(clock[2]);
		if (hours > 23 || minutes > 59) return undefined;
		const at = new Date(now);
		at.setHours(hours, minutes, 0, 0);
		if (at.getTime() <= now.getTime()) at.setDate(at.getDate() + 1);
		return at;
	}
	const parsed = Date.parse(text);
	return Number.isNaN(parsed) ? undefined : new Date(parsed);
}

function asBackend(value: string | undefined): BackendName | undefined {
	for (let i = 0; i < backendNames.length; i++) {
		if (backendNames[i] === value) return backendNames[i];
	}
	return undefined;
}

function usageError(message: string): number {
	console.error(message);
	console.error(USAGE);
	return 2;
}

async function setRest(dataDir: string, argv: string[]): Promise<number> {
	const backend = asBackend(argv[0]);
	if (backend === undefined) return usageError(`Unknown backend: ${argv[0] ?? '(none)'}`);
	let untilText: string | undefined;
	let reason = '';
	for (let i = 1; i < argv.length; i++) {
		const arg = argv[i];
		const value = argv[i + 1];
		if ((arg === '--until' || arg === '--reason') && value !== undefined) {
			if (arg === '--until') untilText = value;
			else reason = value.trim();
			i++;
			continue;
		}
		return usageError(`Unexpected argument for aidd rest set: ${arg}`);
	}
	if (untilText === undefined) return usageError('aidd rest set needs --until <when>');
	const now = new Date();
	const until = parseRestUntil(untilText, now);
	if (until === undefined) return usageError(`Cannot read --until ${untilText}`);
	if (until.getTime() <= now.getTime()) return usageError('--until must be in the future');
	await writeProviderRest(dataDir, {
		backend,
		reason,
		setAt: now.toISOString(),
		source: 'manual',
		until: until.toISOString(),
	});
	const ends = formatRestUntil(until.toISOString(), now);
	console.log(`${backend} rests until ${ends}.`);
	return 0;
}

/** `aidd rest [set|clear]`. Returns the process exit code. */
export async function runRestCommand(argv: string[]): Promise<number> {
	const subcommand = argv[0];
	if (subcommand === '--help' || subcommand === '-h') {
		console.log(USAGE);
		return 0;
	}
	const rootDir = resolveRootDir(import.meta.url, 3);
	const config = await resolveConfig(parseArgs([]), { baseDir: rootDir });
	const dataDir = config.web.dataDir;
	if (subcommand === undefined) {
		const now = new Date();
		const rests = await readProviderRests(dataDir, now);
		if (rests.length === 0) console.log('No backend is resting.');
		for (const rest of rests) {
			const reason = rest.reason.length > 0 ? ` (${rest.reason})` : '';
			const until = formatRestUntil(rest.until, now);
			console.log(`${rest.backend}: resting until ${until}${reason}, ${rest.source}`);
		}
		return 0;
	}
	if (subcommand === 'set') return await setRest(dataDir, argv.slice(1));
	if (subcommand === 'clear') {
		const backend = asBackend(argv[1]);
		if (backend === undefined || argv.length > 2) {
			return usageError('aidd rest clear needs exactly one backend');
		}
		await clearProviderRest(dataDir, backend);
		console.log(`${backend} is not resting.`);
		return 0;
	}
	return usageError(`Unknown rest subcommand: ${subcommand}`);
}
