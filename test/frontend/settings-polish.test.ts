import { describe, expect, test } from 'bun:test';

/**
 * `remediation-20260805-polish-settings`, spec items 1-9.
 *
 * Each test states the finding it closes, so a later change that reopens one fails against the
 * reason rather than against a class string nobody can place.
 */
const settings = async (file: string): Promise<string> =>
	await Bun.file(`${import.meta.dir}/../../frontend/src/pages/settings/${file}`).text();

describe('settings polish', () => {
	test('tones a probe failure apart from a version string', async () => {
		const table = await settings('BackendDefaultsTable.tsx');

		// The status the probe already reports decides the tone — there is no second
		// classification of the message text here.
		expect(table).toContain(
			"if (status.status === 'unavailable') return { text: detail, toneClass: toneText.red };",
		);
		expect(table).toContain(
			"if (status.status === 'missing') return { text: detail, toneClass: toneText.amber };",
		);
		// The version stays muted: it is the nine rows that need nothing done to them.
		expect(table).toContain(
			'if (/\\d/u.test(version)) return { text: version, toneClass: muted };',
		);
		expect(table).toContain('className={`truncate text-xs ${probe.toneClass}`}');
	});

	test('omits a probe version that carries no digits', async () => {
		const table = await settings('BackendDefaultsTable.tsx');

		// lmstudio answers `--version` with a box-drawing banner; stripped of its ANSI that is a
		// row of underscores, which read as a rendering fault rather than as an unhelpful probe.
		expect(table).toContain('const ansiSgrPattern =');
		expect(table).toContain('function probeLine(');
		expect(table).toMatch(/A version is only a version if it contains a digit/u);
		// The raw field is never the rendered line: it goes through probeLine first.
		expect(table).not.toContain('{status.version}');
	});

	test('says "a credential is stored" one way in all three places', async () => {
		const badge = await settings('CredentialBadge.tsx');
		const providers = await settings('ProviderConfigSection.tsx');
		const directAi = await settings('DirectAiSection.tsx');
		const telegram = await settings('TelegramChannelSection.tsx');

		expect(badge).toContain("tone={configured ? 'emerald' : 'neutral'}");
		expect(badge).toContain("{configured ? 'Configured' : 'Not set'}");
		expect(providers).toContain('<CredentialBadge configured={');
		expect(directAi).toContain('<CredentialBadge configured={');
		// Telegram renders it only once there is something to say, as the sibling the input's
		// `aria-describedby` points at — the vocabulary moved, the announcement did not.
		expect(telegram).toContain('<CredentialBadge configured />');
		expect(telegram).toContain('aria-describedby={configuredHint ? BOT_TOKEN_HINT_ID');
		// The three vocabularies this replaced. None of them renders anywhere now.
		expect(providers).not.toContain('Key configured');
		expect(directAi).not.toContain('API key configured');
		// The coloured sentence is gone with the tone import that painted it — matched on the
		// import, since the comment above the badge still quotes the sentence it replaced.
		expect(telegram).not.toContain("from '../../lib/tones.ts'");
	});

	test('leaves every input in a grid row sharing a top edge', async () => {
		const limits = await settings('RunLimitsSection.tsx');

		// The config key renders *after* the input. Before it, it pushed this one field 10px down
		// from the two beside it — and, being FieldRow's first element child, it was also what
		// took the cloned `aria-invalid` and error description meant for the control.
		const input = limits.indexOf('<Input');
		const configKey = limits.indexOf('<ConfigKey name={configKey} />');
		expect(input).toBeGreaterThan(-1);
		expect(configKey).toBeGreaterThan(input);
	});

	test('keeps checkbox help text in the one slot the shared field owns', async () => {
		const field = await Bun.file(
			`${import.meta.dir}/../../frontend/src/components/ui/field.tsx`,
		).text();

		expect(field).toContain('description?: ReactNode;');
		expect(field).toContain('There is exactly one place for it, and this is it.');
		// The box owns the description, so it cannot be rendered as a sibling outside the border.
		expect(field).toMatch(/description \? 'items-start' : 'min-h-9 items-center'/u);
	});

	test('styles both tables on the surface with one column-header treatment', async () => {
		const backends = await settings('BackendDefaultsTable.tsx');
		const metrics = await settings('SystemMetricsSection.tsx');

		for (const surface of [backends, metrics]) {
			expect(surface).toContain("import { tableHeadClass } from '../../lib/tableStyles.ts';");
			expect(surface).toContain('<thead className={tableHeadClass}>');
		}
		// Two cards apart on one surface, with a different case, weight and background each.
		expect(metrics).not.toContain('<thead className="');
		expect(backends).not.toContain('<thead className="');
	});

	test('gives every rating a word rather than a bare dot', async () => {
		const metrics = await settings('SystemMetricsSection.tsx');

		// The screen-reader text was already correct; sighted readers were the ones getting a
		// 6px hue with no legend anywhere on the surface.
		expect(metrics).toContain('function RatingBadge(');
		expect(metrics).toContain("<Badge showDot tone={ratingTone[rating] ?? 'neutral'}>");
		expect(metrics).toContain('<RatingBadge rating={vital.latestRating} />');
		expect(metrics).not.toContain('toneSolid');
	});

	test('lets the ListEditor own its add label', async () => {
		const list = await settings('ListEditor.tsx');

		// One visible word; the noun that says which list it is lives on the accessible name.
		expect(list).toContain('aria-label={`Add ${label} entry`}');
		expect(list).toMatch(/>\s*Add\s*</u);
	});

	test('marks the sticky toolbar edge with a border rather than a shadow', async () => {
		const toolbar = await settings('SettingsToolbar.tsx');

		// Nothing else on Settings is lifted off the page, so the shadow gave this one card a
		// z-axis the rest of the surface does not have.
		expect(toolbar).toContain('border-b-2 border-border');
		// Matched inside the class list, not in the file: the comment above the Card names the
		// utility it dropped, and that sentence is worth keeping.
		expect(toolbar).not.toMatch(/className="[^"]*shadow-md/u);
	});

	test('keeps the Badge Lab rows one shape', async () => {
		const lab = await settings('ExecutionIdentityBadgeLabPage.tsx');

		// Three of eleven entries used to carry a display name loose in the wrap flow, which read
		// as debris beside the eight that carried nothing. It is a title on the chip now.
		expect(lab).toContain('function cliDisplayTitle(');
		expect(lab).toContain('title={cliDisplayTitle(cli)}');
	});
});
