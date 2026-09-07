function isAbsoluteLocalPath(value: string): boolean {
	return value.startsWith('/') || value.startsWith('\\') || /^[A-Za-z]:[\\/]/.test(value);
}

export function applicationRootSyntaxError(applicationRoots: readonly string[]): null | string {
	if (applicationRoots.length === 0) {
		return 'At least one application root is required.';
	}
	for (const [index, value] of applicationRoots.entries()) {
		const root = value.trim();
		if (!root) {
			return `Application root #${index + 1} is empty or whitespace-only. Enter an absolute directory path.`;
		}
		if (!isAbsoluteLocalPath(root)) {
			return `Application root "${root}" is relative. Enter an absolute directory path.`;
		}
	}
	return null;
}
