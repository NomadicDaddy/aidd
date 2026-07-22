import { findCommand, printHelp } from './lib/aidd-tools/commands.ts';

async function main(argv: string[]): Promise<number> {
	const commandName = argv[0];
	if (!commandName || commandName === '--help' || commandName === '-h') {
		printHelp();
		return 0;
	}
	const command = findCommand(commandName);
	if (!command) {
		console.error(`Unknown aidd-tools command: ${commandName}`);
		printHelp();
		return 2;
	}
	if (argv[1] === '--help' || argv[1] === '-h') {
		console.log(command.usage);
		console.log(command.description);
		return 0;
	}
	return await command.run(argv.slice(1));
}

const exitCode = await main(Bun.argv.slice(2)).catch((error: unknown) => {
	const message = error instanceof Error ? error.message : String(error);
	console.error(`aidd-tools failed: ${message}`);
	return 1;
});

process.exit(exitCode);
