import type { Tone } from '../../../lib/tones.ts';

/**
 * Report state on the closed tone scale. The status chip was hard-coded `neutral` for every report,
 * so the one dimension a reader scans for — is this still open? — was the only one without colour,
 * while the kind, which the id prefix also states, carried all of it.
 */
export function reportStatusTone(status: string): Tone {
	const normalized = status.trim().toLowerCase();
	if (normalized === 'resolved' || normalized === 'closed') return 'emerald';
	if (normalized === 'open' || normalized === 'triaged') return 'amber';
	return 'neutral';
}

/**
 * Route ids are base64url of the absolute project path, so a project-scoped report footer printed
 * a 50-60 character opaque string beside human-readable routes like `/recipes` in the same muted
 * line. Only accepted when the decoded value actually looks like a filesystem path — `/projects/aidd`
 * is a legal route too, and is also legal base64url.
 */
function decodeProjectRouteId(id: string): null | string {
	if (!/^[A-Za-z0-9_-]+$/u.test(id)) return null;
	try {
		const normalized = id.replaceAll('-', '+').replaceAll('_', '/');
		const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
		const decoded = new TextDecoder().decode(
			Uint8Array.from(atob(padded), (char) => char.codePointAt(0) ?? 0),
		);
		return /[/\\]/u.test(decoded) ? decoded : null;
	} catch {
		return null;
	}
}

export function reportOriginLabel(pathname: string): string {
	const match = /^\/projects\/([^/]+)(?<tail>\/.*)?$/u.exec(pathname);
	if (!match?.[1]) return pathname;
	const decoded = decodeProjectRouteId(match[1]);
	if (decoded === null) return pathname;
	const name = decoded.split(/[/\\]/u).filter(Boolean).pop() ?? decoded;
	return `Projects › ${name}${match.groups?.tail ?? ''}`;
}
