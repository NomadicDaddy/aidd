// Extension → language mapping for the Repository Info card's line-of-code breakdown. Kept
// deliberately small and source-oriented: only files whose extension resolves to a language here
// are read and counted as code (binary/asset files are still sized, never read). The mapping is
// generic — no aidd-specific directory assumptions — so it works against any git repository.

const EXTENSION_LANGUAGE: Record<string, string> = {
	bash: 'Shell',
	c: 'C',
	cc: 'C++',
	cjs: 'JavaScript',
	clj: 'Clojure',
	cpp: 'C++',
	cs: 'C#',
	css: 'CSS',
	cxx: 'C++',
	dart: 'Dart',
	go: 'Go',
	h: 'C',
	hpp: 'C++',
	htm: 'HTML',
	html: 'HTML',
	java: 'Java',
	js: 'JavaScript',
	json: 'JSON',
	jsx: 'JavaScript',
	kt: 'Kotlin',
	kts: 'Kotlin',
	less: 'CSS',
	lua: 'Lua',
	md: 'Markdown',
	mdx: 'Markdown',
	mjs: 'JavaScript',
	php: 'PHP',
	pl: 'Perl',
	py: 'Python',
	rb: 'Ruby',
	rs: 'Rust',
	scala: 'Scala',
	scss: 'CSS',
	sh: 'Shell',
	sql: 'SQL',
	svelte: 'Svelte',
	swift: 'Swift',
	toml: 'TOML',
	ts: 'TypeScript',
	tsx: 'TypeScript',
	vue: 'Vue',
	yaml: 'YAML',
	yml: 'YAML',
	zsh: 'Shell',
};

// Resolve the human language label for a git-tracked path, or null when it is not source code.
export function languageForPath(path: string): null | string {
	const base = path.slice(path.lastIndexOf('/') + 1);
	const dot = base.lastIndexOf('.');
	if (dot <= 0) return null;
	const ext = base.slice(dot + 1).toLowerCase();
	return EXTENSION_LANGUAGE[ext] ?? null;
}

// Count source lines in a file's text: newline-separated, with a trailing non-empty line counted.
export function countLines(text: string): number {
	if (text.length === 0) return 0;
	let lines = 1;
	for (let index = 0; index < text.length; index += 1) {
		if (text.charCodeAt(index) === 10) lines += 1;
	}
	// A file that ends with a newline has one fewer logical line than newline count + 1.
	if (text.charCodeAt(text.length - 1) === 10) lines -= 1;
	return lines;
}
