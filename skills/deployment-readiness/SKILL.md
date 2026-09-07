---
name: deployment-readiness
description: 'Prepare a managed application for its configured deployment target by adding missing deploy configuration, a deploy script, and `.aidd/deployment.md`; never deploy it. Use for deployment-readiness or deploy-configuration requests.'
metadata:
    aidd-category: recipe-maturity
    aidd-contracts: humanize-docs
---

# Deployment Readiness

Prepare a managed application for deployment based on its assurance profile. This skill
produces the evidence the maturity ladder's **Shipped** stage looks for: a deploy configuration
matching the profile's `deployment` target, and the `.aidd/deployment.md` runbook. It never
performs a deployment and never touches credentials or secrets.

## Usage

```
deployment-readiness [app]
```

If `[app]` is omitted, infer from the current working directory.

## Context

- `.aidd/project-profile.json`: the explicit assurance profile. Its `deployment` field
  (`local | lan | private_server | public_server | cloud`) is the source of truth when the file
  is valid. If it is absent or invalid, follow `readProjectAssuranceProfile()` inference instead
  of assuming `local`: archives, Spernakit apps, and generic apps infer `local`, while Convex apps
  infer `cloud`. Record that the target was inferred.
- The maturity ladder (`shared/src/metadata/maturity.ts`, stage `shipped`) recognizes deploy
  config at any of: `.github/workflows/`, `Dockerfile`, `docker-compose.production.yml`,
  `fly.toml`, `netlify.toml`, `vercel.json`, `wrangler.jsonc`, `wrangler.toml`. For
  `deployment: local` profiles the deploy-config artifact is not required. Only the runbook
  and a release tag.
- Spernakit-derived apps (`spernakit_version`, or a `stack` declaration that resolves to the
  `spernakit` family, in `package.json`) already have a canonical container shape: one monolithic
  container (nginx + supervisord + Bun backend + built frontend), with TLS terminated by an
  external reverse proxy and configuration mounted as JSON. Read
  `<spernakit-root>/docs/template/STACK.md` and `<spernakit-root>/docs/template/DEPLOYMENT.md` from
  the registered Spernakit checkout.
  `<aidd-root>/audits/DEPLOYMENT.md` supplies audit expectations, but the live Spernakit files and
  template docs define the container shape.

## Instructions

### Phase 1: Resolve target and read the profile

1. Parse `$ARGUMENTS` for the app path. Resolve and verify the directory exists.
2. Read `.aidd/project-profile.json`. If it is absent or invalid, infer the profile using the
   current `readProjectAssuranceProfile()` rules and note both `deployment` and the inferred source.
3. Read `package.json`: note the stack (Spernakit vs generic), existing scripts (especially
   `deploy`, `build`, `start`), and the app version.
4. Inventory existing deploy config from the recognized list above, plus any `Caddyfile`,
   `compose*.yml`, or CI workflows. Existing deploy-config files are **never modified or
   overwritten**. Record them in the runbook and report any confirmed mismatch with the resolved
   deployment target as an owner decision.

### Phase 2: Decide what is missing

By `deployment` target:

- **`local`:** no deploy config needed. The runbook documents how the app is run locally
  (the `dev`/`start` script aidd's launcher uses) and how releases are tagged.
- **`lan` / `private_server` / `public_server`:** a container shape: `Dockerfile` and
  `docker-compose.production.yml`. For Spernakit apps, follow the Spernakit reference shape
  (single container, single exposed HTTP port bound to `127.0.0.1`, non-root user,
  `read_only: true`, dropped capabilities, healthcheck hitting `/api/v1/health`, pinned image
  selected through an immutable or explicitly versioned `APP_IMAGE`, with `APP_VERSION` recorded
  alongside the deployment). For `public_server`, also document reverse-proxy TLS termination
  (Caddy snippet) in the runbook.
- **`cloud`:** prefer the platform the code already signals: `wrangler.toml`/`wrangler.jsonc`
  when Cloudflare Workers deps are present, `vercel.json` for Vercel-shaped apps, `fly.toml`
  when Fly is referenced. When nothing signals a platform, fall back to the container shape
  (Dockerfile + compose) and note the choice in the report.

Independent of target:

- Ensure `package.json` has a **`deploy` script**. If missing, add one. When the deploy action
  is knowable (e.g. `wrangler deploy`, `docker compose -f docker-compose.production.yml up -d`),
  wire it. When it is not, add the placeholder pattern the scaffold uses for `dev`: a script
  that echoes what to configure and exits 1. The bundled deploy recipe runs `bun run deploy`,
  so the placeholder makes the missing decision loud instead of silent.

### Phase 3: Write the missing config

Create only the files Phase 2 identified as missing. Match the app's existing conventions
(indentation, comment style). Keep every generated file minimal and working: no speculative
options, no secret values, and no `.env` files. Spernakit settings are JSON-based; app-internal
secrets may stay in the mounted, untracked JSON config or use the documented production env
overrides, while provider secrets may use the app's established split secrets-file pattern.
Container images must never bake in secrets. Document the established runtime source without
copying any value into the runbook.

### Phase 4: Write the runbook

Write `.aidd/deployment.md` (create or refresh; preserve any hand-written sections
byte-for-byte and only fill gaps). Structure:

```markdown
# Deployment

## Target

<deployment value from the profile, one sentence on what that means for this app>

## How to deploy

<the deploy command (`bun run deploy` and what it does), or the local run story for `local`>

## Configuration

<inventory of deploy config files and what each controls; where secrets are supplied at runtime, never their values>

## Verify

<how to confirm a deploy worked: health endpoint URL or command, expected response>

## Roll back

<how to return to the previous version: prior image tag, previous release tag, platform rollback command>

## Releases

<the project's established tag workflow and current latest tag if any; the bundled deploy recipe creates `deploy-<timestamp>`>
```

Runbook prose follows the humanize-docs style contract
(`.aidd/skills/humanize-docs/SKILL.md`, staged; or `<aidd-root>/skills/humanize-docs/SKILL.md` in
the aidd repo): plain operational language, no em-dashes,
no AI filler (delve, leverage, robust, seamless). Commands, paths, and URLs stay exact.

### Phase 5: Verify and report

1. If files were added and the app has a build/validate script, confirm nothing broke
   (`bun run build` or the app's equivalent). A generated Dockerfile does not need a full
   image build; a syntax sanity pass is enough.
2. Report as counts and lists: files created, files already present (skipped), the deploy
   command, and any decision the owner still has to make (e.g. placeholder `deploy` script,
   unset domain in the Caddy snippet).

## Notes

- **Never overwrite deploy config.** An existing Dockerfile, workflow, or wrangler config is
  authoritative; inventory it, don't replace it. `package.json` may be edited only to add a
  missing `deploy` script. `.aidd/deployment.md` may be refreshed, but hand-written content stays
  byte-for-byte intact.
- **No secrets.** Do not read, echo, or template credential values. Reference only the established
  env var names or secret-file paths.
- **No deployment.** Do not run the deploy command, push images, or call platform CLIs against
  live infrastructure. Readiness only.
- **Local is a first-class answer.** For `deployment: local`, create no deploy config. Still ensure
  the `deploy` script and runbook exist. Emitting container config for a local CLI tool is noise,
  not readiness.
