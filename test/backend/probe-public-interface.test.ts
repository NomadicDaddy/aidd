import { describe, expect, test } from 'bun:test';
import type { NetworkInterfaceInfo } from 'node:os';
import { createServer, type Server } from 'node:net';
import { formatInterfaceHost, probePublicInterface } from '../../backend/src/startHelpers.ts';

function ipv4(address: string, internal = false): NetworkInterfaceInfo {
	return {
		address,
		cidr: `${address}/24`,
		family: 'IPv4',
		internal,
		mac: '00:00:00:00:00:00',
		netmask: '255.255.255.0',
	};
}

function ipv6(address: string, scopeid: number, internal = false): NetworkInterfaceInfo {
	return {
		address,
		cidr: `${address}/64`,
		family: 'IPv6',
		internal,
		mac: '00:00:00:00:00:00',
		netmask: 'ffff:ffff:ffff:ffff::',
		scopeid,
	};
}

/** A connect probe that records every target and answers only for `reachable`. */
function recordingProbe(reachable: ReadonlySet<string>) {
	const probed: string[] = [];
	const probe = (_port: number, address: string): Promise<boolean> => {
		probed.push(address);
		return Promise.resolve(reachable.has(address));
	};
	return { probe, probed };
}

describe('probePublicInterface', () => {
	test('returns a reachable non-internal IPv6 address', async () => {
		const { probe, probed } = recordingProbe(new Set(['2001:db8::10']));
		const lister = () => ({ eth0: [ipv4('192.0.2.10'), ipv6('2001:db8::10', 0)] });

		expect(await probePublicInterface(3210, 50, lister, probe)).toBe('2001:db8::10');
		expect(probed).toEqual(['192.0.2.10', '2001:db8::10']);
	});

	test('returns a reachable IPv4 address', async () => {
		const { probe } = recordingProbe(new Set(['192.0.2.10']));
		const lister = () => ({ eth0: [ipv4('192.0.2.10')] });

		expect(await probePublicInterface(3210, 50, lister, probe)).toBe('192.0.2.10');
	});

	test('never probes internal entries of either family', async () => {
		const { probe, probed } = recordingProbe(new Set(['::1', '127.0.0.1']));
		const lister = () => ({ lo: [ipv4('127.0.0.1', true), ipv6('::1', 0, true)] });

		expect(await probePublicInterface(3210, 50, lister, probe)).toBeNull();
		expect(probed).toEqual([]);
	});

	test('probes a link-local IPv6 entry with its scope id', async () => {
		const { probe, probed } = recordingProbe(new Set(['fe80::1%12']));
		const lister = () => ({ eth0: [ipv6('fe80::1', 12)] });

		expect(await probePublicInterface(3210, 50, lister, probe)).toBe('fe80::1%12');
		expect(probed).toEqual(['fe80::1%12']);
	});

	test('returns null when nothing is reachable', async () => {
		const { probe, probed } = recordingProbe(new Set());
		const lister = () => ({
			eth0: [ipv4('192.0.2.10'), ipv6('2001:db8::10', 0)],
			wlan: undefined,
		});

		expect(await probePublicInterface(3210, 50, lister, probe)).toBeNull();
		expect(probed).toEqual(['192.0.2.10', '2001:db8::10']);
	});

	test('the default connect probe detects a real listener and a closed port', async () => {
		const server: Server = createServer((socket) => socket.destroy());
		await new Promise<void>((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
		const address = server.address();
		if (address === null || typeof address === 'string') throw new Error('no port');
		const lister = () => ({ eth0: [ipv4('127.0.0.1')] });
		try {
			expect(await probePublicInterface(address.port, 1000, lister)).toBe('127.0.0.1');
		} finally {
			await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
		}
		expect(await probePublicInterface(address.port, 1000, lister)).toBeNull();
	});
});

describe('formatInterfaceHost', () => {
	test('brackets IPv6 literals and leaves IPv4 unchanged', () => {
		expect(formatInterfaceHost('2001:db8::10')).toBe('[2001:db8::10]');
		expect(formatInterfaceHost('fe80::1%12')).toBe('[fe80::1%12]');
		expect(formatInterfaceHost('192.0.2.10')).toBe('192.0.2.10');
	});
});
