// eslint-disable-next-line no-control-regex
const ansiPattern = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b[=>(]B?|\x07/g;

export function stripAnsi(value: string): string {
	return value.replace(ansiPattern, '');
}
