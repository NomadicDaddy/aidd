# aidd Runtime Compatibility

aidd preserves a stable public runtime contract for projects and operators.

## Stable surfaces

- documented CLI flags remain valid where implemented by `shared/src/args/`
- backend names remain `native`, `ollama`, `lmstudio`, `claude-code`, `opencode`, `kilocode`, and `codex`
- prompt source files remain under `prompts/`
- `.aidd/features/*/feature.json` remains the feature contract
- `.aidd/iterations/NNN.log` and `.aidd/iterations/NNN.json` remain the iteration artifacts
- `.aidd/CHANGELOG.md`, `.aidd/spec.md`, `.aidd/.artifacts-check.json`, `.aidd/audit-reports/*.md`, `.dance-state.json`, and `.stop` remain stable paths
- `recipes/*.json` is the web recipe source of truth, with ids derived from filenames so the
  existing `aidd-web` recipe inventory can be copied into aidd without per-file id fields
- Triumvirate mode stores its role and decisioning evidence inside the existing iteration JSON
  artifact under `triumvirate`; it does not require a new run ledger or database migration

The store intentionally does not require a migration or a new run ledger. New run metadata should
be added only as an optional mirror unless the compatibility contract is explicitly revised.

## Breaking changes (2026-05-26)

Each entry below pairs the change with the migration step. The full per-release history is in
[CHANGELOG.md](../CHANGELOG.md).

- **Top-level `apiKey` / `baseUrl` removed from `config.json`.** The native backend, Direct AI
  service, and Settings pre-flight validation no longer fall back to top-level values.
  _Migrate:_ move them under `providers.<provider>.*`, e.g. `providers.zhipu.apiKey` and
  `providers.zhipu.baseUrl`.
- **The `internal` backend alias is removed** from CLI flags, config files, the runs and
  settings route schemas, and the `BackendInputName` union in `shared/src/plan/types.ts`.
  _Migrate:_ replace any `"cli": "internal"` or `triumvirate.*Cli: "internal"` with
  `"native"`.
- **The legacy SQLite migration baseline shim (`detectLegacyBaseline`) is removed.** Pre-ledger
  databases (product tables but no `schema_migrations` table) can no longer be upgraded in
  place. _Migrate:_ delete the old database before the next launch; otherwise migration 0002
  fails with `duplicate column name`. (Project-local `.aidd/` metadata is unaffected.)

## Compatibility gates

- `bun run smoke:qc` runs typecheck, tests, and format check
- `bun run smoke:e2e` runs a local launcher/core smoke through Native simulation
- `bun run smoke:backends` attempts one iteration for each backend and skips missing external CLIs
  unless `-RequireExternal` is passed to the PowerShell script
