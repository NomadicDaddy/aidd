#!/usr/bin/env bun

const OFFSET = 2;
const MAX_PORT = 65_535;

function fail(message: string): never {
	console.error(`Port mapping failed: ${message}`);
	process.exit(1);
}

const values = Bun.argv.slice(2);
if (values.length === 0) {
	fail('provide at least one live port');
}

const livePorts = values.map((value) => {
	if (!/^\d+$/.test(value)) fail(`invalid port "${value}"`);
	const port = Number(value);
	if (!Number.isSafeInteger(port) || port < 1 || port > MAX_PORT) {
		fail(`port ${value} must be an integer from 1 through ${MAX_PORT}`);
	}
	if (port + OFFSET > MAX_PORT) {
		fail(`port ${port} cannot be incremented by ${OFFSET}`);
	}
	return port;
});

if (new Set(livePorts).size !== livePorts.length) {
	fail('live ports must be unique');
}

const liveSet = new Set(livePorts);
const playgroundPorts = livePorts.map((port) => port + OFFSET);
if (new Set(playgroundPorts).size !== playgroundPorts.length) {
	fail('mapped playground ports must be unique');
}

for (const port of playgroundPorts) {
	if (liveSet.has(port)) {
		fail(`mapped playground port ${port} overlaps a live port`);
	}
}

console.log(
	JSON.stringify(
		{
			offset: OFFSET,
			portMap: livePorts.map((live, index) => ({
				live,
				playground: playgroundPorts[index],
			})),
		},
		null,
		'\t'
	)
);
