# smoke:qc runbook

The quality gate. `bun run smoke:qc` runs every step below in order and stops at the first failure;
`bun run smoke:qc:fast` runs the four-step static subset that `.githooks/pre-commit` uses.

**The step lists on this page are generated.** They come from `scripts/lib/smoke-qc/steps.ts`, which
is the registry the runner actually executes. Edit that file, then run `bun run smoke:docs` and
commit the result; `bun run check:smoke-docs` fails the gate when the two disagree. Everything
outside the numbered lists is hand-written and is left alone by the generator.

## Full gate (`bun run smoke:qc`)

Ordered by ascending expected time-to-first-failure, so a doomed tree fails as early as it can:
sub-second checks first, then format/typecheck/lint, then the test suite, and last the builds and
the two steps that read build output. Results are cached per step in `scripts/smoke-cache.json`
against a hash of that step's declared inputs, so an unchanged step is skipped rather than rerun.
Steps whose inputs are outside this repository (`check:shared-core`) or are runtime state
(`check-application`, `check-deps`, and the audit and schema checks) are registered uncacheable and
always run.

Steps (in order):

1. `bun run check:max-lines`
    - No tracked source file exceeds the 300-line modularity ceiling.
2. `bun run check:script-targets`
    - Every package.json script resolves to a real file and a defined task.
3. `bun run check:smoke-docs`
    - scripts/smoke-qc.md describes the steps this registry actually declares.
4. `bun run test:gate-conventions`
    - The gate rule library still fails a deliberately non-conforming fixture.
5. `bun run check:gate-conventions`
    - Every gate follows the conventions in docs/reference/gate-conventions.md.
6. `bun run check:fresh-release`
    - A fresh release presents parseable, append-safe artifacts (DATA-003).
7. `bun run check:web-db-integrity`
    - Every project reference a run or pipeline row carries resolves (DATA-007).
8. `bun run check:env-spread`
    - Child processes receive only the environment they need (SEC-002).
9. `bun run check:git-window-hide`
    - Direct Git subprocesses hide their Windows console window (SEC-006).
10. `bun run check:docs`
    - Every internal Markdown link resolves to a file that exists.
11. `bun run check:destructive-confirmation`
    - Every destructive frontend action is confirmed before dispatch (WEB-007).
12. `bun run check:backend-cli-boundary`
    - aidd-backend never imports aidd-cli, which would close a cycle (QUAL-004).
13. `bun run check:no-inline-references`
    - Drizzle foreign keys are declared as named constraints (DATA-008).
14. `bun run check:schema-parity`
    - The migrations produce the database the Drizzle schema declares (DATA-006).
15. `bun run check:feature-integration`
    - Every route plugin and page is registered somewhere (QUAL-004).
16. `bun run check:artifact-parity`
    - artifacts.md is the whole .aidd catalog and scaffolding/.gitignore its projection.
17. `bun run check:hook-parity`
    - scaffolding/.githooks matches .githooks and ships every guard it sources.
18. `bun run check:scaffold`
    - The fresh-project scaffold matches its owners and passes its own quality gate.
19. `bun run check:audit-artifact-hygiene`
    - Audit findings stay distinct, well-formed, and never future-dated (BEH-004).
20. `bun run check:audit-profile-mapping`
    - The audit profile mapping parses and every audit it names exists.
21. `bun run check-application`
    - Databases and runtime state live in the repository-root data/ tree (DATA-001).
22. `bun run check-deps`
    - Workspaces agree on each shared dependency and the lockfile parses (QUAL-003).
23. `bun run check:dead-code`
    - knip finds no unused files, exports, or dependencies.
24. `bun run self-contained`
    - Every path a standalone checkout needs is present, with no sibling-tree references.
25. `bun run check:licenses`
    - Every package in the resolved closure has a recognized license and a notice.
26. `bun run prompt:snapshot:check`
    - The committed prompt snapshots match what the prompt sources compile to.
27. `bun run check:leak-guard`
    - The commit-time leak guard still blocks every secret shape it claims to.
28. `bun run check:shared-core`
    - Every shared file is byte-identical in the repositories the manifest sends it to.
29. `bun run format:check`
    - Prettier reports no formatting drift.
30. `bun run typecheck`
    - The root and frontend TypeScript projects compile with no errors.
31. `bun run lint`
    - Every workspace passes ESLint, uncached so the type-aware rules are authoritative.
32. `bun run test:coverage`
    - The bun:test suite passes and coverage stays above its thresholds.
33. `bun run build:frontend`
    - The Vite production build of the web surface succeeds.
34. `bun run verify-minification`
    - Frontend assets are minified and the bundle stays inside its byte budget.
35. `bun run check:critical-path`
    - The first load keeps its preloaded-chunk shape, not only its byte total (WEB-001).

## Fast gate (`bun run smoke:qc:fast`)

The inner-loop gate: formatting, line limit, types, and lint. No test suite, no builds, no project
checks. Run it repeatedly while fixing errors, then run the full gate once before committing.

Its order is measured rather than intuited (cost ÷ P(fail), with the numbers recorded in
`scripts/lib/smoke-qc/fast-subset.ts`), so it does not match the full gate's order. `lint` is
replaced here by `lint:fast`, which uses ESLint's `--cache`; the replacement records under its own
cache key so a fast pass can never satisfy the full gate's uncached `lint`.

The leak guard is deliberately absent: it scans the staged index diff, which is runtime state, so
`.githooks/pre-commit` calls it directly ahead of this gate rather than through it.

Steps (in order):

1. `bun run check:max-lines`
    - No tracked source file exceeds the 300-line modularity ceiling.
2. `bun run typecheck`
    - The root and frontend TypeScript projects compile with no errors.
3. `bun run format:check`
    - Prettier reports no formatting drift.
4. `bun run lint:fast`
    - Every workspace passes ESLint, with the cache the inner loop wants.
