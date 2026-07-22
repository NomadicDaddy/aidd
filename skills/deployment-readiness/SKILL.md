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
deployment-readiness [appname]
```

If `[appname]` is omitted, infer from the current working directory.

## Context

- `.aidd/project-profile.json`: the assurance profile. Its `deployment` field
  (`local | lan | private_server | public_server | cloud`) is the single source of truth for
  where the app is expected to run. If the file is absent, treat the target as `local` (the
  inference default) and say so in the report.
- The maturity ladder (`shared/src/metadata/maturity.ts`, stage `shipped`) recognizes deploy
  config at any of: `.github/workflows/`, `Dockerfile`, `docker-compose.production.yml`,
  `fly.toml`, `netlify.toml`, `vercel.json`, `wrangler.jsonc`, `wrangler.toml`. For
  `deployment: local` profiles the deploy-config artifact is not required. Only the runbook
  and a release tag.
- Spernakit-derived apps (a `spernakit_version` or `stack` field in `package.json`) already have
  a canonical container shape: single monolithic container (nginx + supervisord + Bun backend +
  built frontend), TLS terminated by an external reverse proxy, config mounted as JSON, secrets
  injected via env. `audits/DEPLOYMENT.md` in the aidd repository documents that reference shape;
  follow it rather than inventing a new one.

## Instructions

### Phase 1: Resolve target and read the profile

1. Parse `$ARGUMENTS` for the app path. Resolve and verify the directory exists.
2. Read `.aidd/project-profile.json`; note `deployment` (default `local` when absent).
3. Read `package.json`: note the stack (Spernakit vs generic), existing scripts (especially
   `deploy`, `build`, `start`), and the app version.
4. Inventory existing deploy config from the recognized list above, plus any `Caddyfile`,
   `compose*.yml`, or CI workflows. Existing files are **never modified or overwritten**;
   they are recorded in the runbook as-is.

### Phase 2: Decide what is missing

By `deployment` target:

- **`local`:** no deploy config needed. The runbook documents how the app is run locally
  (the `dev`/`start` script aidd's launcher uses) and how releases are tagged.
- **`lan` / `private_server` / `public_server`:** a container shape: `Dockerfile` and
  `docker-compose.production.yml`. For Spernakit apps, follow the Spernakit reference shape
  (single container, single exposed HTTP port bound to `127.0.0.1`, non-root user,
  `read_only: true`, dropped capabilities, healthcheck hitting `/api/v1/health`, pinned image
  tag via `APP_VERSION`). For `public_server`, also document reverse-proxy TLS termination
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
options, no secrets, no `.env` files (Spernakit apps are JSON-config only). Container images
must not bake in secrets; document env injection in the runbook instead.

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

<inventory of deploy config files and what each controls; where secrets come from (env), never their values>

## Verify

<how to confirm a deploy worked: health endpoint URL or command, expected response>

## Roll back

<how to return to the previous version: prior image tag, previous release tag, platform rollback command>

## Releases

<how releases are tagged (`git tag vX.Y.Z`); current latest tag if any>
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

- **Never overwrite.** An existing Dockerfile, workflow, or wrangler config is authoritative;
  inventory it, don't replace it. The only file this skill rewrites is
  `.aidd/deployment.md`, and there it preserves hand-written content.
- **No secrets.** Do not read, echo, or template credential values. Reference env var _names_
  only.
- **No deployment.** Do not run the deploy command, push images, or call platform CLIs against
  live infrastructure. Readiness only.
- **Local is a first-class answer.** For `deployment: local` the correct output is a runbook
  that says so. Emitting container config for a local CLI tool is noise, not readiness.
