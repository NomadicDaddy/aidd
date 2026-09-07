import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { applicationRootSyntaxError } from 'aidd-shared/application-roots';

import { ApiError } from '../../frontend/src/api/client.ts';
import { applicationRootsValidationMessage } from '../../frontend/src/hooks/useSettings.ts';
import { settingsSaveBlockReason } from '../../frontend/src/pages/settings/settingsSaveValidation.ts';
import { createBlankSettings } from '../../frontend/src/pages/settings/settingsUtils.ts';

const frontendRoot = resolve(import.meta.dir, '../../frontend/src');

interface ValidRootsRender {
	blockReason: null | string;
	blockedToolbar: string;
	hookResult: string;
	queryData: unknown;
	queryError: null | string;
	requests: string[];
	toolbar: string;
}

let cached: undefined | ValidRootsRender;

/**
 * Mounts the real hook against a real HTTP 200 carrying the endpoint's real body shape.
 *
 * The failure this guards was invisible to source-reading assertions: every symbol was spelled
 * correctly and the endpoint answered 200, but the query function resolved `undefined`, TanStack
 * Query v5 rejects that, and `retry: false` + `staleTime: Infinity` made the resulting `isError`
 * permanent — blocking Save on all five Settings tabs for every input. Only actually driving the
 * query catches it, so this renders in a subprocess rooted at `frontend/` where the app's own
 * import specifiers resolve.
 */
function renderValidRootsSurfaces(): ValidRootsRender {
	if (cached) return cached;
	const script = String.raw`
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { validateApplicationRoots } from './src/api/settings.ts';
import { useApplicationRootsValidation } from './src/hooks/useSettings.ts';
import { PageRail } from './src/components/shared/PageRail.tsx';
import { settingsSaveBlockReason } from './src/pages/settings/settingsSaveValidation.ts';
import { SettingsToolbar } from './src/pages/settings/SettingsToolbar.tsx';
import { createBlankSettings } from './src/pages/settings/settingsUtils.ts';

const roots = ['D:/applications'];
const requests = [];
globalThis.fetch = async (input) => {
	requests.push(String(input));
	return new Response(JSON.stringify({ valid: true }), {
		headers: { 'content-type': 'application/json' },
		status: 200,
	});
};

const client = new QueryClient({
	defaultOptions: { queries: { retry: false, staleTime: Infinity } },
});
let queryError = null;
let queryData = null;
try {
	queryData = await client.fetchQuery({
		queryFn: () => validateApplicationRoots(roots),
		queryKey: ['settings-application-roots-validation', roots],
	});
} catch (err) {
	queryError = err instanceof Error ? err.message : String(err);
}

let hookResult = 'NOT-RENDERED';
function Probe() {
	hookResult = String(useApplicationRootsValidation(roots, true));
	return null;
}
renderToStaticMarkup(h(QueryClientProvider, { client }, h(Probe, null)));

const toolbarProps = (saveBlockReason) => ({
	activeTab: 'workspace',
	dirty: true,
	dirtyTabs: new Set(['workspace']),
	onChange: () => {},
	onDiscard: () => {},
	onSave: () => {},
	saveBlockReason,
	savePending: false,
});
const render = (saveBlockReason) =>
	renderToStaticMarkup(
		h(
			QueryClientProvider,
			{ client },
			h(PageRail, { rail: 'bounded' }, h(SettingsToolbar, toolbarProps(saveBlockReason))),
		),
	);

const blockReason = settingsSaveBlockReason(
	createBlankSettings(),
	hookResult === 'null' ? null : hookResult,
	null,
	false,
);
console.log(
	JSON.stringify({
		blockReason,
		blockedToolbar: render('Application root "D:/nope" does not exist.'),
		hookResult,
		queryData,
		queryError,
		requests,
		toolbar: render(blockReason),
	}),
);
`;
	const result = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: resolve(import.meta.dir, '../../frontend'),
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
	cached = JSON.parse(new TextDecoder().decode(result.stdout)) as ValidRootsRender;
	return cached;
}

describe('Settings application-root validation', () => {
	test('provides immediate reasons for blank and relative roots', () => {
		expect(applicationRootSyntaxError([''])).toBe(
			'Application root #1 is empty or whitespace-only. Enter an absolute directory path.',
		);
		expect(applicationRootSyntaxError(['   '])).toContain(
			'root #1 is empty or whitespace-only',
		);
		expect(applicationRootSyntaxError(['relative/apps'])).toContain(
			'root "relative/apps" is relative',
		);
		expect(applicationRootSyntaxError(['C:\\applications', '/srv/applications'])).toBeNull();
	});

	test('binds root validation to the Settings save-block reason', async () => {
		const page = await readFile(
			resolve(frontendRoot, 'pages/settings/SettingsPage.tsx'),
			'utf8',
		);
		const hook = await readFile(resolve(frontendRoot, 'hooks/useSettings.ts'), 'utf8');

		expect(page).toContain('useApplicationRootsValidation(form.applicationRoots, formSeeded)');
		expect(page).toContain('settingsSaveBlockReason(');
		expect(
			settingsSaveBlockReason(
				createBlankSettings(),
				'Application root is invalid.',
				null,
				false,
			),
		).toBe('Workspace: Application root is invalid.');
		expect(hook).toContain("return 'Checking application roots…'");
		expect(hook).toContain('retry: false');
	});

	test('leaves Save enabled when the roots endpoint answers that they are valid', () => {
		const rendered = renderValidRootsSurfaces();

		expect(rendered.queryError).toBeNull();
		expect(rendered.queryData).toEqual({ valid: true });
		expect(rendered.requests).toEqual(['/api/v1/settings/application-roots/validate']);

		expect(rendered.hookResult).toBe('null');
		expect(rendered.blockReason).toBeNull();

		// The attribute, not the substring: the button's own class list carries
		// `disabled:pointer-events-none`, so a bare `toContain('disabled')` passes either way.
		const save = rendered.toolbar.slice(rendered.toolbar.lastIndexOf('<button'));
		expect(save).toContain('Save Settings');
		expect(save).not.toContain('disabled=""');
		expect(rendered.toolbar).not.toContain('settings-application-roots-validation');
		expect(rendered.toolbar).not.toContain('Could not validate application roots');
	});

	test('renders a blocked save differently from a benign status line', () => {
		const rendered = renderValidRootsSurfaces();

		expect(rendered.toolbar).toContain('role="status"');
		expect(rendered.toolbar).not.toContain('role="alert"');
		expect(rendered.toolbar).not.toContain('text-red-700');

		expect(rendered.blockedToolbar).toContain('role="alert"');
		expect(rendered.blockedToolbar).toContain('text-red-700');
		expect(rendered.blockedToolbar).toContain('does not exist.');
		expect(rendered.blockedToolbar).not.toContain('text-amber-600');

		const blockedSave = rendered.blockedToolbar.slice(
			rendered.blockedToolbar.lastIndexOf('<button'),
		);
		expect(blockedSave).toContain('disabled=""');
	});

	test('never renders a library internal as the validation message', () => {
		expect(
			applicationRootsValidationMessage(
				new ApiError('Application root "D:/nope" does not exist.', 400),
			),
		).toBe('Application root "D:/nope" does not exist.');
		expect(
			applicationRootsValidationMessage(
				new Error(
					'Query data cannot be undefined. Affected query key: ["settings-application-roots-validation",["D:/applications"]]',
				),
			),
		).toBe(
			'Could not validate application roots. Check the connection to the aidd server and try again.',
		);
		expect(applicationRootsValidationMessage(new ApiError('   ', 500))).toBe(
			'Could not validate application roots. Check the connection to the aidd server and try again.',
		);
	});
});
