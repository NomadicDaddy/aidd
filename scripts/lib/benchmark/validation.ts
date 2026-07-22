import { readFileSync } from 'node:fs';

export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function stringValue(value: unknown): string | undefined {
	return typeof value === 'string' ? value : undefined;
}

export function numberValue(value: unknown): number | undefined {
	return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function booleanValue(value: unknown): boolean | undefined {
	return typeof value === 'boolean' ? value : undefined;
}

export function stringArray(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((entry): entry is string => typeof entry === 'string')
		: [];
}

export function readJsonUnknown(filePath: string): unknown {
	return JSON.parse(readFileSync(filePath, 'utf8')) as unknown;
}

export function requireRecord(value: unknown, label: string): Record<string, unknown> {
	if (!isRecord(value)) throw new Error(`${label} must be an object`);
	return value;
}

export function requireString(record: Record<string, unknown>, key: string, label: string): string {
	const value = stringValue(record[key]);
	if (!value) throw new Error(`${label}.${key} must be a non-empty string`);
	return value;
}

export function optionalString(
	record: Record<string, unknown>,
	key: string,
	label: string
): string | undefined {
	const value = stringValue(record[key]);
	if (record[key] !== undefined && !value) throw new Error(`${label}.${key} must be a string`);
	return value;
}

export function requireNumber(record: Record<string, unknown>, key: string, label: string): number {
	const value = numberValue(record[key]);
	if (value === undefined) throw new Error(`${label}.${key} must be a number`);
	return value;
}

export function optionalInteger(
	record: Record<string, unknown>,
	key: string,
	label: string
): number | undefined {
	const value = record[key];
	if (value === undefined) return undefined;
	if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
		throw new Error(`${label}.${key} must be a non-negative integer`);
	}
	return value;
}
