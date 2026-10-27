const RULES = ['private-key', 'aws-access-id', 'provider-key', 'github-token'];
const FIELDS = ['files', 'textFiles', 'packageControl', 'envFiles', 'positiveControls', 'matches'];

/**
 * A scanner may name credential paths in its inline source without returning their contents.
 * Accept only the empty scanner report: every returned string is a fixed rule name, never a
 * path, match or file value. Mixed output, extra fields and nonempty findings remain untrusted.
 */
export function isEmptyScannerReport(command: string, output: unknown): boolean {
	if (!/\bbun\s+(?:-e|--eval)\s/.test(command) || typeof output !== 'string') return false;
	let parsed: unknown;
	try {
		parsed = JSON.parse(output);
	} catch {
		return false;
	}
	if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
	const report = parsed as Record<string, unknown>;
	const controls = report.positiveControls;
	if (Object.keys(report).length !== FIELDS.length || !FIELDS.every((key) => key in report))
		return false;
	return (
		typeof report.files === 'number' &&
		Number.isSafeInteger(report.files) &&
		report.files >= 0 &&
		typeof report.textFiles === 'number' &&
		Number.isSafeInteger(report.textFiles) &&
		report.textFiles >= 0 &&
		report.textFiles <= report.files &&
		typeof report.packageControl === 'boolean' &&
		Array.isArray(report.envFiles) &&
		report.envFiles.length === 0 &&
		Array.isArray(report.matches) &&
		report.matches.length === 0 &&
		Array.isArray(controls) &&
		controls.length === RULES.length &&
		RULES.every((rule, index) => controls[index] === rule)
	);
}
