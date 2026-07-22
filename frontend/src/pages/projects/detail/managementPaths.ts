export function joinPreviewPath(root: string, name: string): string {
	const trimmedRoot = root.replace(/[\\/]+$/, '');
	return `${trimmedRoot}\\${name}`;
}

export function projectNameFromPath(path: string): string {
	const parts = path.split(/[\\/]/).filter(Boolean);
	return parts.at(-1) ?? path;
}

export function parentDirectoryFromPath(path: string): string {
	const trimmed = path.replace(/[\\/]+$/, '');
	const separatorIndex = Math.max(trimmed.lastIndexOf('\\'), trimmed.lastIndexOf('/'));
	return separatorIndex > 0 ? trimmed.slice(0, separatorIndex) : trimmed;
}
