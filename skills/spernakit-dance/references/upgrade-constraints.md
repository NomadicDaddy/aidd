# Upgrade Constraints

Standing norms for the dance, each one earned by a run that went wrong without it. Read before
Part A and again before Part D.

- Require a `smoke:qc` result for every scoped app, taken from D1's in-run copy or from a separate
  D2 run.
- Check per-file drift in `lib/`, `hooks/`, `utils/`, and `components/shared/`.
- Record intentional template divergence in `.templateoverrides`. Register page imports in
  `frontend/src/routes/lazyPages.ts` and route objects in `frontend/src/routes/routeGroups.tsx` or
  `frontend/src/routes/settingsRoutes.tsx`; never add page entries to `frontend/src/routes.tsx`.
- Keep `scripts/template-manifest.json` byte-identical across Spernakit and derived apps.
- Use the real base tag for multi-version catch-up and hand-port skipped files across contract
  migrations.
- Merge new gates into a customized `smoke.json`; never preserve a stale gate set.
- Audit removed lines against the template's own history before every release commit; a green gate
  does not prove app-owned work survived the copy.
- Read every override and every `branded` file from the target side, not only the app side.
- Refresh `spernakit.psd1` from each app after D3 and require `check:fleet-manifest` to exit 0.
- Start each app with `bun run start` before its Part B tester; `smoke:dev` stops itself and `dev`
  cannot be held open by a worker, so neither leaves a session to authenticate against.
- Record per-app outcomes in `perApp` using its four status values, never in invented top-level keys.
- Take ports and versions from `config/<slug>.json` and `package.json`, never from the manifest,
  `.env`, or a framework default.
- Format-check `.aidd` metadata with an explicit `--ignore-path` override; `/.aidd/` sits in
  `.prettierignore`, so an unqualified `prettier --check` on those paths passes having read nothing.
- Preserve required license-material copy steps in branded Dockerfiles.
- Keep the leak guard in derived apps. The template puts the two-tier guard on the template
  surface: `.githooks/leak-guard.sh`, `.githooks/leak-guard-setup.sh`, `scripts/check-leak-guard.sh`
  and `scripts/run-bash.ts` ship to every app, `check:leak-guard` is a real qc step rather than a
  `templateOnly` one, and `scripts/check-leak-guard.sh` is drift-checked. Deleting it and recording a
  `DELETED` override strips a working commit-time secret guard out of every app it touches.
- When a template fix requires retagging, resync apps already upgraded and restore the prior release
  tag before running `document-changes`.
- Bump each app before its supertest and tag it only after that supertest is green; screenshots are
  written under the app version and the docker test image is tagged with it.
- Treat the `smoke:qc` inside `smoke:reset` as D2's evidence rather than running a second cached
  copy, and never treat a green pre-commit as a `smoke:qc` result.
- Run `template-sync-plan.ts` from the template with `--app`, and intersect its output with
  `git diff --name-only v{base} v{target}` before copying anything.
- Leave `spernakit_version` off every feature record authored in a derived app.
- Regenerate each app's `critical-path-budget.json` after the upgrade. Seven of nine apps finished
  the v3.44.0 dance still carrying the template's own numbers verbatim, so their budget gate is
  measuring the template's bundle rather than theirs.
