import { DETACHED_SPAWN_FLAG, runDetachedSpawn } from 'aidd-shared/lib/detachedSpawn';

import { run } from './app.ts';

const argv = process.argv.slice(2);

// Relauncher mode (Windows detached-run shim): the web backend started us via a hidden
// PowerShell Start-Process bridge (`<program> --detached-spawn <payload>`) so we live
// outside its job object and inherit none of its handles (notably the web listener
// socket). Re-spawn the real run as our child and babysit it, then exit with its code.
// Intercepted before run() so the normal arg parser never sees these internal flags.
if (argv[0] === DETACHED_SPAWN_FLAG) {
	process.exit(await runDetachedSpawn(argv[1]));
}

// Subcommands are intercepted before run() because the run arg parser rejects positionals.
if (argv[0] === 'new') {
	const { runNewCommand } = await import('./commands/new.ts');
	process.exit(await runNewCommand(argv.slice(1)));
}
if (argv[0] === 'findings') {
	const { runFindingsCommand } = await import('./commands/findings.ts');
	process.exit(await runFindingsCommand(argv.slice(1)));
}

const exitCode = await run(argv);
process.exit(exitCode);
