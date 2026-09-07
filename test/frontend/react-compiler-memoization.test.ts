import { describe, expect, test } from 'bun:test';
import { join, relative, resolve } from 'node:path';

const FRONTEND = resolve(import.meta.dir, '../../frontend');

function runInFrontend(lines: string[]): string {
	const result = Bun.spawnSync([process.execPath, '-e', lines.join('\n')], {
		cwd: FRONTEND,
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
	return new TextDecoder().decode(result.stdout).trim();
}

interface GuardReport {
	files: string[];
	hooks: string[];
	members: string[];
	plain: string[];
}

let guard: GuardReport | undefined;

const HOOK_FIXTURE = [
	"import { useCallback, useMemo } from 'react';",
	'export function Example({ values }: { values?: string[] }) {',
	'\tconst fallback = useMemo(() => values ?? [], [values]);',
	'\tconst callback = useCallback(() => fallback.length, [fallback]);',
	'\treturn callback();',
	'}',
].join('\n');

const MEMBER_FIXTURE = [
	"import * as React from 'react';",
	'export function Example({ values }: { values?: string[] }) {',
	'\tconst fallback = React.useMemo(() => values ?? [], [values]);',
	'\tconst callback = React.useCallback(() => fallback.length, [fallback]);',
	'\treturn callback();',
	'}',
].join('\n');

const PLAIN_FIXTURE = [
	'export function Example({ values }: { values?: string[] }) {',
	'\tconst fallback = values ?? [];',
	'\tconst callback = () => fallback.length;',
	'\treturn callback();',
	'}',
].join('\n');

function reportGuard(): GuardReport {
	guard ??= JSON.parse(
		runInFrontend([
			"import { ESLint } from 'eslint';",
			"import tseslint from 'typescript-eslint';",
			`const HOOK = ${JSON.stringify(HOOK_FIXTURE)};`,
			`const MEMBER = ${JSON.stringify(MEMBER_FIXTURE)};`,
			`const PLAIN = ${JSON.stringify(PLAIN_FIXTURE)};`,
			"const config = (await import('./eslint.config.js')).default;",
			"const block = config.find((entry) => entry?.rules?.['no-restricted-syntax']);",
			'const eslint = new ESLint({',
			'\tbaseConfig: [{',
			'\t\tfiles: block.files,',
			'\t\tlanguageOptions: { parser: tseslint.parser },',
			"\t\trules: { 'no-restricted-syntax': block.rules['no-restricted-syntax'] },",
			'\t}],',
			'\tcwd: process.cwd(),',
			'\toverrideConfigFile: true,',
			'});',
			'const lint = async (code) => {',
			'\tconst [result] = await eslint.lintText(code, {',
			"\t\tfilePath: process.cwd() + '/src/guard-fixture.tsx',",
			'\t});',
			'\treturn result.messages.map((message) => message.message);',
			'};',
			'console.log(JSON.stringify({',
			'\tfiles: block.files,',
			'\thooks: await lint(HOOK),',
			'\tmembers: await lint(MEMBER),',
			'\tplain: await lint(PLAIN),',
			'}));',
		]),
	) as GuardReport;
	return guard;
}

describe('React Compiler owns frontend memoization', () => {
	test('the compiler-enabled source tree contains no manual memo hooks', async () => {
		const violations: string[] = [];
		const glob = new Bun.Glob('**/*.{ts,tsx}');
		for await (const path of glob.scan({ absolute: true, cwd: join(FRONTEND, 'src') })) {
			const source = await Bun.file(path).text();
			if (/\b(?:useCallback|useMemo)\b/u.test(source)) {
				violations.push(relative(FRONTEND, path));
			}
		}
		expect(violations).toEqual([]);
	});

	test('the four audited nullish fallbacks are direct render-time expressions', async () => {
		const cases = [
			['src/pages/director/DirectorPage.tsx', 'director.chatSessions.data ?? []'],
			['src/components/shared/DirectorChatModal.tsx', 'director.chatSessions.data ?? []'],
			['src/pages/projects/ProjectIntakePanel.tsx', 'settings.data?.templates ?? []'],
			['src/components/layout/ProjectReportDialog.tsx', 'projects.data?.projects ?? []'],
		] as const;

		for (const [path, expression] of cases) {
			const source = await Bun.file(join(FRONTEND, path)).text();
			expect(source).toContain(expression);
			expect(source).not.toMatch(/\buseMemo\b/u);
		}
	});

	test('the lint gate rejects imported and namespaced memo hooks', () => {
		expect(reportGuard()).toEqual({
			files: ['**/*.{ts,tsx}'],
			hooks: [
				'React Compiler owns callback identity; do not import `useCallback`.',
				'React Compiler owns memoization; do not import `useMemo`.',
				'React Compiler owns memoization; derive the value during render.',
				'React Compiler owns callback identity; declare a plain function.',
			],
			members: [
				'React Compiler owns memoization; do not call `React.useMemo`.',
				'React Compiler owns callback identity; do not call `React.useCallback`.',
			],
			plain: [],
		});
	});
});
