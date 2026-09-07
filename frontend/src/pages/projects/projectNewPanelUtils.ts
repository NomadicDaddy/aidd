import type { ProjectCreateSpecInput } from '../../api/types.ts';

export type SpecKind = 'none' | 'path' | 'text';

export const NAME_PATTERN = /^[A-Za-z0-9._-]+$/;

interface NormalizedAbsolutePath {
	flavor: 'posix' | 'windows';
	value: string;
}

function normalizeAbsolutePath(input: string): NormalizedAbsolutePath | null {
	const path = input.trim().replaceAll('\\', '/');
	const windowsDrive = /^([A-Za-z]:)\/(.*)$/u.exec(path);
	const isUnc = path.startsWith('//');
	const isPosix = !isUnc && path.startsWith('/');
	if (!windowsDrive && !isUnc && !isPosix) return null;

	const flavor = windowsDrive || isUnc ? 'windows' : 'posix';
	const prefix = windowsDrive ? windowsDrive[1]!.toLowerCase() : isUnc ? '//' : '/';
	const remainder = windowsDrive ? windowsDrive[2]! : path.slice(prefix.length);
	const segments: string[] = [];
	for (const segment of remainder.split('/')) {
		if (segment === '' || segment === '.') continue;
		if (segment === '..') {
			segments.pop();
			continue;
		}
		segments.push(flavor === 'windows' ? segment.toLowerCase() : segment);
	}
	const separator = prefix.endsWith('/') ? '' : '/';
	return { flavor, value: `${prefix}${separator}${segments.join('/')}` };
}

export function isAllowedSpecPath(applicationRoots: string[], candidate: string): boolean {
	const normalizedCandidate = normalizeAbsolutePath(candidate);
	if (!normalizedCandidate) return false;
	return applicationRoots.some((root) => {
		const normalizedRoot = normalizeAbsolutePath(root);
		if (!normalizedRoot || normalizedRoot.flavor !== normalizedCandidate.flavor) return false;
		const childPrefix = normalizedRoot.value.endsWith('/')
			? normalizedRoot.value
			: `${normalizedRoot.value}/`;
		return (
			normalizedCandidate.value === normalizedRoot.value ||
			normalizedCandidate.value.startsWith(childPrefix)
		);
	});
}

// Client-side mirror of the backend's parseGithubTemplateSource (shared/src/git/degit.ts),
// used only for name autofill and inline validation — the backend re-validates authoritatively.
// Accepts https://github.com/owner/repo, github.com/owner/repo, or owner/repo, each with an
// optional .git suffix, trailing slash, and #ref.
export function parseGithubSource(input: string): { name: string } | null {
	const trimmed = input.trim();
	if (trimmed.length === 0) return null;
	const hashIndex = trimmed.indexOf('#');
	const ref = hashIndex === -1 ? null : trimmed.slice(hashIndex + 1);
	let path = hashIndex === -1 ? trimmed : trimmed.slice(0, hashIndex);
	if (
		ref !== null &&
		(ref.length === 0 || !/^[A-Za-z0-9._/-]+$/.test(ref) || ref.startsWith('-'))
	) {
		return null;
	}
	path = path.replace(/^https:\/\//i, '');
	if (/^github\.com\//i.test(path)) path = path.slice('github.com/'.length);
	path = path.replace(/\/+$/, '');
	const segments = path.split('/');
	if (segments.length !== 2) return null;
	const owner = segments[0] ?? '';
	let repo = segments[1] ?? '';
	if (repo.toLowerCase().endsWith('.git')) repo = repo.slice(0, -'.git'.length);
	if (!/^[A-Za-z0-9-]+$/.test(owner) || !NAME_PATTERN.test(repo)) return null;
	if (repo === '.' || repo === '..') return null;
	return { name: repo };
}

export function buildSpec(
	kind: SpecKind,
	text: string,
	pathValue: string,
): null | ProjectCreateSpecInput {
	if (kind === 'text') {
		const trimmed = text.trim();
		return trimmed.length === 0 ? null : { kind: 'text', value: text };
	}
	if (kind === 'path') {
		const trimmed = pathValue.trim();
		return trimmed.length === 0 ? null : { kind: 'path', value: trimmed };
	}
	return null;
}
