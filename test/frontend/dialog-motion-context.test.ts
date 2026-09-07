import { describe, expect, test } from 'bun:test';
import { join, resolve } from 'node:path';

/**
 * The shared dialog provided its motion state with React 19's context shorthand on one line and
 * consumed it with `useContext` fifteen lines later, and a composition review reported the codebase
 * had no `useContext` at all. Both halves are covered here: the panel really does read the value the
 * dialog provides (and the declared default when there is no dialog above it), and the lint gate
 * rejects the older spelling on the way back in.
 */

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

interface Markup {
	closed: string;
	defaulted: string;
	nested: string;
	open: string;
}

let markup: Markup | undefined;

/** Renders the real component through React itself, rather than reading its source for intent. */
function renderDialogs(): Markup {
	markup ??= JSON.parse(
		runInFrontend([
			"import { createElement } from 'react';",
			"import { renderToStaticMarkup } from 'react-dom/server';",
			"import { Dialog, DialogPanel } from './src/components/ui/dialog.tsx';",
			'const noop = () => {};',
			'const panel = (children) => createElement(DialogPanel, null, children);',
			'const dialog = (open, children) =>',
			'\trenderToStaticMarkup(createElement(Dialog, { onClose: noop, open }, children));',
			'console.log(',
			'\tJSON.stringify({',
			"\t\tclosed: dialog(false, panel('body')),",
			"\t\tdefaulted: renderToStaticMarkup(panel('body')),",
			'\t\tnested: dialog(',
			'\t\t\ttrue,',
			"\t\t\tcreateElement('section', null, createElement('div', null, panel('deep'))),",
			'\t\t),',
			"\t\topen: dialog(true, panel('body')),",
			'\t}),',
			');',
		]),
	) as Markup;
	return markup;
}

interface GuardReport {
	files: string[];
	hook: string[];
	member: string[];
	modern: string[];
}

let guard: GuardReport | undefined;

const HOOK_FIXTURE = [
	"import { createContext, useContext } from 'react';",
	"const Ctx = createContext('open');",
	'export function Panel() {',
	'\treturn useContext(Ctx);',
	'}',
].join('\n');

const MEMBER_FIXTURE = [
	"import * as React from 'react';",
	"const Ctx = React.createContext('open');",
	'export function Panel() {',
	'\treturn React.useContext(Ctx);',
	'}',
].join('\n');

const MODERN_FIXTURE = [
	"import { createContext, use } from 'react';",
	"const Ctx = createContext('open');",
	'export function Panel() {',
	'\treturn use(Ctx);',
	'}',
].join('\n');

/**
 * Drives ESLint over the rule entry read out of `frontend/eslint.config.js` itself, so deleting or
 * loosening the rule in that file is what this reports on — not a copy of it restated here. The
 * fixtures are linted as text: a file written into `frontend/src` would be seen by the sibling
 * suites that scan that tree, and `bun test` runs them in parallel.
 */
function reportGuard(): GuardReport {
	guard ??= JSON.parse(
		runInFrontend([
			"import { ESLint } from 'eslint';",
			"import tseslint from 'typescript-eslint';",
			`const HOOK = ${JSON.stringify(HOOK_FIXTURE)};`,
			`const MEMBER = ${JSON.stringify(MEMBER_FIXTURE)};`,
			`const MODERN = ${JSON.stringify(MODERN_FIXTURE)};`,
			"const config = (await import('./eslint.config.js')).default;",
			"const block = config.find((entry) => entry?.rules?.['no-restricted-syntax']);",
			'const eslint = new ESLint({',
			'\tbaseConfig: [',
			'\t\t{',
			'\t\t\tfiles: block.files,',
			'\t\t\tlanguageOptions: { parser: tseslint.parser },',
			"\t\t\trules: { 'no-restricted-syntax': block.rules['no-restricted-syntax'] },",
			'\t\t},',
			'\t],',
			'\tcwd: process.cwd(),',
			'\toverrideConfigFile: true,',
			'});',
			'const lint = async (code) => {',
			'\tconst [result] = await eslint.lintText(code, {',
			"\t\tfilePath: process.cwd() + '/src/guard-fixture.tsx',",
			'\t});',
			'\treturn result.messages.map((message) => message.message);',
			'};',
			'console.log(',
			'\tJSON.stringify({',
			'\t\tfiles: block.files,',
			'\t\thook: await lint(HOOK),',
			'\t\tmember: await lint(MEMBER),',
			'\t\tmodern: await lint(MODERN),',
			'\t}),',
			');',
		]),
	) as GuardReport;
	return guard;
}

describe('the dialog panel reads its motion state through React 19 `use`', () => {
	test('an open dialog renders its overlay and hands the panel the same motion state', () => {
		const { open } = renderDialogs();

		expect(open).toContain('role="dialog"');
		expect(open).toContain('aria-modal="true"');
		// The overlay mounts at `closed` and animates open on the next frame; the panel is only
		// reading what the dialog provides, so both carry the same state at first paint.
		expect(open.match(/data-state="closed"/g)?.length).toBe(2);
		expect(open).toContain('>body</div>');
	});

	test('a closed dialog renders nothing, panel and all', () => {
		expect(renderDialogs().closed).toBe('');
	});

	test('a panel nested below the provider still reads the dialog state', () => {
		// Two elements deep rather than a direct child: a panel that only worked as `children` of
		// the dialog would be reading a prop, not a context.
		expect(renderDialogs().nested).toMatch(
			/<section><div><div [^>]*data-state="closed"[^>]*>deep<\/div><\/div><\/section>/u,
		);
	});

	test('a panel with no dialog above it falls back to the declared default', () => {
		const { defaulted } = renderDialogs();

		expect(defaulted).toContain('data-state="open"');
		expect(defaulted).not.toContain('data-state="closed"');
	});

	test('the primitive consumes the context with `use`, not the legacy hook', async () => {
		const source = await Bun.file(
			join(FRONTEND, 'src', 'components', 'ui', 'dialog.tsx'),
		).text();

		expect(source).toContain('use(DialogMotionContext)');
		expect(source).toContain('<DialogMotionContext value={motionState}>');
		expect(source).not.toMatch(/\buseContext\b/u);
	});
});

describe('the frontend lint gate rejects a return to `useContext`', () => {
	test('the rule covers every TypeScript source in the frontend tree', () => {
		expect(reportGuard().files).toEqual(['**/*.{ts,tsx}']);
	});

	test('a `useContext` call and its import are both reported', () => {
		expect(reportGuard().hook).toEqual([
			'Import `use` from react instead of `useContext`.',
			"Read context with React 19's `use(Context)`, not `useContext(Context)`.",
		]);
	});

	test('reaching for the namespaced spelling is reported too', () => {
		expect(reportGuard().member).toEqual([
			"Read context with React 19's `use(Context)`, not `React.useContext(Context)`.",
		]);
	});

	test('the React 19 spelling passes clean', () => {
		expect(reportGuard().modern).toEqual([]);
	});
});
