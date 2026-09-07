# Fleet Registry and Scope

What defines fleet membership, and which file is authoritative for a given fact.

Fleet membership lives in `<spernakit-root>/spernakit.psd1`. `<applications-root>/AGENTS.md`
defines workspace locations and general rules, but does not enumerate the fleet.

**The manifest declares membership; each app owns the metadata mirrored into its entry.**
`scripts/lib/fleet/manifest.ts` and `scripts/lib/fleet/sync.ts` resolve those values from:

- tracked `package.json` (`version` and, for derived apps, `spernakit_version`);
- tracked `backend/src/config/defaults.json` (`app.slug`, which selects the runtime config); and
- runtime `config/<app.slug>.json` (`app.name`, `app.description`, `server.backendPort`, and
  `server.frontendPort`).

Read those files whenever a concrete value matters. The manifest is a gitignored local mirror and
can go stale as soon as an app changes; run `bun run fleet-manifest:sync` after such changes and
require `bun run check:fleet-manifest` before closing the Dance (see D3). Ports live under `server`,
not a `dev.*` key. Do not infer them from `.env` or a Vite default.

**Default scope**: every entry in `<spernakit-root>/spernakit.psd1` except the `spernakit` template
itself. Every derived-app entry must have a concrete semantic `spernakit_version`; abort preflight
when the manifest is missing one or contains a non-semver value. Do not hardcode app counts, lists,
or individual app slugs elsewhere. `spernakit-lite` apps are out of default scope; include one only
when explicitly passed via `--scope`.
