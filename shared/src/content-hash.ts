import { createHash } from 'node:crypto';

/**
 * Text as hashed: a leading byte order mark dropped and CRLF folded to LF, so a checkout with
 * autocrlf and one without describe the same document.
 */
export function canonicalText(content: string): string {
	const withoutBom = content.startsWith('﻿') ? content.slice(1) : content;
	return withoutBom.replaceAll('\r\n', '\n');
}

export function sha256Text(content: string): string {
	return createHash('sha256').update(canonicalText(content)).digest('hex');
}

/** JSON with every object's keys sorted, recursively, so key order never changes the hash. */
export function canonicalJson(value: unknown): string {
	return JSON.stringify(value, (_key, current: unknown) =>
		isPlainObject(current)
			? Object.fromEntries(
					Object.keys(current)
						.sort(compareCodepoints)
						.map((key) => [key, current[key]]),
				)
			: current,
	);
}

export function sha256Json(value: unknown): string {
	return sha256Text(canonicalJson(value));
}

export interface HashedMember {
	id: string;
	sha256: string;
}

/**
 * Hash of a set of already-hashed members, independent of the order they were supplied in. Each
 * member contributes its own `id:sha256` line, so moving content between members (splitting one
 * audit document into two, merging two into one) changes the result; hashing the concatenated
 * contents would not.
 */
export function sha256Set(members: readonly HashedMember[]): string {
	const lines = members.map((member) => `${member.id}:${member.sha256}`).sort(compareCodepoints);
	return sha256Text(lines.join('\n'));
}

/**
 * Ordering by Unicode code point, the same on every platform and locale. `localeCompare` is not:
 * it folds case and honours locale collation, so mixed-case ids sort differently per machine.
 */
export function compareCodepoints(left: string, right: string): number {
	const leftPoints = [...left];
	const rightPoints = [...right];
	const shared = Math.min(leftPoints.length, rightPoints.length);
	for (let index = 0; index < shared; index++) {
		const delta =
			(leftPoints[index]?.codePointAt(0) ?? 0) - (rightPoints[index]?.codePointAt(0) ?? 0);
		if (delta !== 0) return delta;
	}
	return leftPoints.length - rightPoints.length;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
	const prototype: unknown = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}
