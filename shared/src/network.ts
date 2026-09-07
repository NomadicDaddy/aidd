export function normalizedHostname(hostname: string): string {
	return hostname
		.trim()
		.toLowerCase()
		.replace(/^\[|\]$/g, '');
}

function ipv4Octets(hostname: string): null | number[] {
	const parts = hostname.split('.');
	if (parts.length !== 4) return null;
	const octets: number[] = [];
	for (const part of parts) {
		if (!/^\d{1,3}$/.test(part)) return null;
		const value = Number(part);
		if (!Number.isInteger(value) || value < 0 || value > 255) return null;
		octets.push(value);
	}
	return octets;
}

export function isLoopbackHostname(hostname: string): boolean {
	const normalized = normalizedHostname(hostname);
	if (normalized === 'localhost' || normalized === '::1') return true;
	const octets = ipv4Octets(normalized);
	return octets !== null && octets[0] === 127;
}

export function isWildcardHostname(hostname: string): boolean {
	const normalized = normalizedHostname(hostname);
	return normalized === '0.0.0.0' || normalized === '::';
}
