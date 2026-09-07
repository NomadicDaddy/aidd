# aidd Runtime Compatibility

aidd preserves a stable public runtime contract for projects and operators.

## Stable surfaces

- documented CLI flags remain valid where implemented by `shared/src/args/`
- backend names remain `native`, `ollama`, `lmstudio`, `openai`, `claude-code`, `cline`,
  `opencode`, `kilocode`, `codex`, and `grok`
- prompt source files remain under `prompts/`
- `.aidd/features/*/feature.json` remains the feature contract
- `.aidd/iterations/NNN.log` and `.aidd/iterations/NNN.json` remain the iteration artifacts
- `.aidd/CHANGELOG.md`, `.aidd/spec.md`, `.aidd/.artifacts-check.json`, `.aidd/audit-reports/*.md`,
  `.aidd/.stop`, and `<applications-root>/.dance-state.json` remain stable paths
- `recipes/*.json` is the web recipe source of truth, with ids derived from filenames so a recipe
  inventory can be dropped in without per-file id fields
- Triumvirate mode stores its evidence inside the existing iteration JSON artifact: stage and
  decision evidence under `triumvirate`, the four role assignments under `triumvirateRoles`, and
  `executionMode: "triumvirate"`. It does not require a new run ledger or database migration

The store intentionally does not require a migration or a new run ledger. New run metadata should
be added only as an optional mirror unless the compatibility contract is explicitly revised.

## Configuration contract

These rules are enforced rather than tolerated; a value in the wrong place is ignored or rejected
instead of being read with a fallback. Public releases are documented in
[CHANGELOG.md](../CHANGELOG.md).

- **Provider credentials live under `providers.<provider>.*`** in `config.json`, e.g.
  `providers.zhipu.apiKey` and `providers.zhipu.baseUrl`. The native backend, Direct AI service,
  and Settings pre-flight validation read only those keys; top-level `apiKey` / `baseUrl` values
  are not consulted.
- **The native backend is named `native`** in CLI flags, config files, the runs and settings route
  schemas, and the `BackendInputName` union in `shared/src/plan/types.ts`. `"cli": "native"` and
  `triumvirate.*Cli: "native"` are the accepted spellings; there is no alias.
- **The web database is created and upgraded only through the `schema_migrations` ledger.** The
  registry starts from a single `0001_baseline` migration that creates the whole schema. A database
  file that carries product tables without the baseline version recorded in its ledger is not
  upgraded in place: stop aidd, delete `aidd-panel.db` together with its `-wal`, `-shm`, and `.lock`
  sidecars from the data directory, then start aidd again to create a fresh one. (Project-local
  `.aidd/` metadata is unaffected.)

## Compatibility gates

- `bun run smoke:qc` runs the full static-check gate: format check, lint, typecheck, tests, the
  frontend build, and the repo checks around them (`check:max-lines`, `check:schema-parity`,
  `check:dead-code`, `prompt:snapshot:check`, `check:leak-guard`, and the rest of
  `scripts/lib/smoke-qc/steps.ts`). `bun run smoke:qc:fast` runs the fast subset.
- `bun run smoke:e2e` scaffolds a throwaway project and runs one CLI iteration through the native
  simulation backend, asserting the seeded feature comes back completed
- `bun run smoke:backends` attempts one iteration for each backend and skips missing external CLIs
  unless `--require-external` is passed
