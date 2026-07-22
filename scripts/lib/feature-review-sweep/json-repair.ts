import { type FeatureJson, type ParseResult } from './types.ts';

export function detectIndent(text: string): string {
	for (const line of text.split(/\r?\n/)) {
		const match = line.match(/^([ \t]+)"/);
		if (match?.[1]) {
			return match[1];
		}
	}
	return '\t';
}

export function detectNewline(text: string): string {
	return text.includes('\r\n') ? '\r\n' : '\n';
}

export function stringifyJson(feature: FeatureJson, indent: string, newline: string): string {
	return `${JSON.stringify(feature, null, indent)}${newline}`;
}

function repairMissingCommas(text: string): string {
	const newline = detectNewline(text);
	const repaired = text.split(/\r?\n/);

	for (let index = 0; index < repaired.length - 1; index += 1) {
		const current = repaired[index];
		if (current === undefined) {
			continue;
		}
		const trimmedCurrent = current.trimEnd();
		if (
			trimmedCurrent === '' ||
			trimmedCurrent.endsWith(',') ||
			trimmedCurrent.endsWith('{') ||
			trimmedCurrent.endsWith('[') ||
			trimmedCurrent.endsWith(':')
		) {
			continue;
		}

		let nextIndex = index + 1;
		while (nextIndex < repaired.length && repaired[nextIndex]?.trim() === '') {
			nextIndex += 1;
		}
		if (nextIndex >= repaired.length) {
			continue;
		}

		const nextTrimmed = repaired[nextIndex]?.trimStart() ?? '';
		if (!nextTrimmed.startsWith('"')) {
			continue;
		}

		if (/[}"\]\d]$/.test(trimmedCurrent) || /(?:true|false|null)$/.test(trimmedCurrent)) {
			repaired[index] = `${trimmedCurrent},${current.slice(trimmedCurrent.length)}`;
		}
	}

	return repaired.join(newline);
}

function repairTrailingCommas(text: string): string {
	return text.replace(/,\s*([}\]])/g, '$1');
}

export function parseJsonWithRepair(rawText: string): ParseResult {
	try {
		return { json: JSON.parse(rawText) as FeatureJson, repaired: false, text: rawText };
	} catch (err) {
		let candidate = repairMissingCommas(rawText);
		if (candidate !== rawText) {
			try {
				return {
					json: JSON.parse(candidate) as FeatureJson,
					repaired: true,
					text: candidate,
				};
			} catch {
				// fall through to the trailing-comma repair
			}
		}

		candidate = repairTrailingCommas(candidate);
		if (candidate !== rawText) {
			try {
				return {
					json: JSON.parse(candidate) as FeatureJson,
					repaired: true,
					text: candidate,
				};
			} catch {
				// unrepairable; report the original parse error below
			}
		}

		return {
			error: err instanceof Error ? err.message : String(err),
			json: null,
			repaired: false,
			text: rawText,
		};
	}
}
