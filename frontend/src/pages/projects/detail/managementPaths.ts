export function joinPreviewPath(root: string, name: string): string {
	const trimmedRoot = root.replace(/[\\/]+$/, '');
	return `${trimmedRoot}\\${name}`;
}

export function projectDirectoryNameError(name: string): null | string {
	const trimmed = name.trim();
	if (trimmed === '.' || trimmed === '..' || /[\\/]/.test(trimmed)) {
		return 'Use one folder name without path separators or traversal segments.';
	}
	return null;
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

export function projectPathsMatch(candidate: string, projectPath: string): boolean {
	const normalize = (path: string) =>
		path.trim().replaceAll('\\', '/').replace(/\/+$/, '').toLowerCase();
	const normalizedProjectPath = normalize(projectPath);
	return normalizedProjectPath !== '' && normalize(candidate) === normalizedProjectPath;
}
