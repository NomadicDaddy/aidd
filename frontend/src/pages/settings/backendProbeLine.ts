import type { SettingsCliStatus } from '../../api/types.ts';

import { toneText } from '../../lib/tones.ts';

const ansiSgrPattern = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');

const clean = (value: string): string =>
	value.replace(ansiSgrPattern, '').replace(/\s+/gu, ' ').trim();

/**
 * Returns the useful probe detail without echoing the installation-status badge.
 * A version is only a version if it contains a digit: lmstudio can return a box-drawing banner.
 */
export function backendProbeLine(status: SettingsCliStatus | undefined): {
	text: string;
	toneClass: string;
} {
	const muted = 'text-muted-foreground';
	if (!status) return { text: 'Not detected', toneClass: muted };
	const version = clean(status.version ?? '');
	if (/\d/u.test(version)) return { text: version, toneClass: muted };
	const detail = clean(status.detail);
	if (!detail || detail.toLowerCase() === status.status) {
		return { text: 'Version not reported', toneClass: muted };
	}
	if (status.status === 'unavailable') return { text: detail, toneClass: toneText.red };
	if (status.status === 'missing') return { text: detail, toneClass: toneText.amber };
	return { text: detail, toneClass: muted };
}
