---
name: aidd
description: Launch aidd to run a named skill against a registered local project, then report the run and outcome. Use for /aidd followed by project, skill and optional skill arguments, or an explicit request to delegate that workflow to aidd.
metadata:
    aidd-category: runtime
---

# Launch aidd

Run the requested workflow through aidd proper. Resolve the project and skill, submit one skill
session, and follow its result. Do not perform the selected workflow in the calling conversation.

## Usage

```text
aidd <project> <skill> [skill arguments]
```

Examples: `/aidd summon review-features` and `/aidd beazley.org cut-release`. These are invocation
examples, not requests to launch them during installation or testing. In Codex, use `$aidd` with
the same arguments or select it from `/skills`; installing a skill does not create a built-in
Codex slash command.

Map `review-features` to `feature-review`; preserve other names and trailing arguments. Refuse
`aidd` as the selected skill to prevent recursive launches.

## Locate aidd

Read `installation.json` beside this skill when present; its `aiddRoot` identifies the source
installation. In the canonical package, the root is two directories above the skill directory.
Verify that root's `package.json` identifies `aidd` and that `scripts/aidd-client.ts` exists. If
neither location resolves, ask for the installation path. Do not guess a machine-specific path,
download another installation, or start/restart the panel to bypass an unavailable service.

Use the installation's authenticated client, which reads its configured host, port and credentials
at use time. Never print credentials or put them in a request body, command argument or file.

```text
bun <aidd-root>/scripts/aidd-client.ts --path /api/v1/projects
bun <aidd-root>/scripts/aidd-client.ts --path /api/v1/skills
```

## Resolve the request

1. Match the requested project to exactly one registry entry by name or explicit path. Use that
   entry's full `path`. Missing or ambiguous matches require clarification; do not create or
   register a guessed directory or substitute a similarly named project.
2. Read the full selected definition from `GET /api/v1/skills/<id>` and its required references.
   The native catalog includes bundled and managed imports; a skill visible to the calling agent
   is not automatically installed in aidd.
3. If the named skill is absent but its exact permitted local package is available, use aidd's
   existing local-folder import flow: POST `/api/v1/skills/imports/preview`, then
   `/api/v1/skills/imports`, with `{"sourcePath":"<package directory>","category":"general"}`.
   Read the preview, require the requested id and `conflict: "none"`, and retain the source/hash.
   This installs only the named package needed by this invocation. Respect configured Application
   Roots and host permissions; never widen them, replace an existing skill, fetch an alternative
   source or install unrelated packages. Report an unavailable or refused source. Re-read the
   imported definition before launching it.
4. Read the target project's applicable instructions and current state. Set `executionIntent`
   explicitly: `review-only` for a requested read-only assessment, or `apply-changes` for the
   requested skill's authorized edits. Derive intent from the actual workflow, not merely a word
   such as “review” in its name. Preserve operator holds and the skill's own release, publication
   and approval boundaries. A dispatch is not approval to bypass them.

## Launch once and follow the result

Author and verify a UTF-8 JSON body file containing `projectDir`, `executionIntent` and `args`.
Pass the trailing skill arguments as one string. Add backend/model/reasoning-effort overrides only
when requested; otherwise use aidd's configured defaults.

```text
bun <aidd-root>/scripts/aidd-client.ts --method POST --path /api/v1/skills/<id>/run --body-file <request.json>
```

Record the returned `session.id` immediately. That is a pipeline session id, not proof a child run
has started. Follow `GET /api/v1/pipeline-sessions/<session-id>/report`, retain the actual child
`runId` values from its steps, and inspect their run details or canonical artifacts when needed.
Keep following a queued/running/stopping session to its actual terminal outcome. Do not create a
second session because the first is slow, a transport result is ambiguous, or the provider fails.
Do not alter stop state, restart services or relaunch without the applicable direction.

Report the resolved project, canonical skill/source, intent, session and child run ids, terminal
status, validation and actual deliverables. A heartbeat or successful POST proves neither useful
progress nor completed work. Preserve failures, parked work and human decisions still needed;
do not infer release or publication acceptance from a completed session.
