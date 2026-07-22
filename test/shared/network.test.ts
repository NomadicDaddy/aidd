import { describe, expect, test } from 'bun:test';
import {
	isLoopbackHostname,
	isWildcardHostname,
	normalizedHostname,
} from '../../shared/src/network.ts';

describe('shared network hostname helpers', () => {
	test('normalizes casing, whitespace, and IPv6 brackets', () => {
		expect(normalizedHostname(' LOCALHOST ')).toBe('localhost');
		expect(normalizedHostname('[::1]')).toBe('::1');
	});

	test('recognizes loopback hostnames with strict IPv4 octets', () => {
		expect(isLoopbackHostname('localhost')).toBe(true);
		expect(isLoopbackHostname('::1')).toBe(true);
		expect(isLoopbackHostname('[::1]')).toBe(true);
		expect(isLoopbackHostname('127.0.0.1')).toBe(true);
		expect(isLoopbackHostname('127.0.0.2')).toBe(true);
		expect(isLoopbackHostname('127.999.0.0')).toBe(false);
		expect(isLoopbackHostname('192.168.1.33')).toBe(false);
	});

	test('recognizes wildcard bind hostnames', () => {
		expect(isWildcardHostname('0.0.0.0')).toBe(true);
		expect(isWildcardHostname('::')).toBe(true);
		expect(isWildcardHostname('[::]')).toBe(true);
		expect(isWildcardHostname('127.0.0.1')).toBe(false);
	});
});
