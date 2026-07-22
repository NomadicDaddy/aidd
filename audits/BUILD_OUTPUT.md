---
title: 'Build Output and Delivery Audit'
last_updated: '2026-07-21'
version: '1.1'
category: 'Performance'
priority: 'High'
estimated_time: '1-2 hours'
frequency: 'Per release'
prerequisites: 'HTTP caching and content negotiation, ES module preload semantics, bundler chunk graphs, container image layering'
lifecycle: 'pre-release'
---

# Build Output and Delivery Audit

> **Severity Reference**: See [SEVERITY_CLASSIFICATION.md](./SEVERITY_CLASSIFICATION.md) for issue prioritization.
> **Methodology gate**: See [AUDIT_METHODOLOGY.md](./AUDIT_METHODOLOGY.md). Phase 0 (validate the instrument before you read it) applies in full: every number in this report must carry an instrument record naming the build, the server, and the statistic.

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [The Governing Rule](#the-governing-rule)
3. [Audit Scope](#audit-scope)
4. [Instruments](#instruments)
5. [Phase 1: Establish the Delivery Topology](#phase-1-establish-the-delivery-topology)
6. [Phase 2: Inventory What Shipped](#phase-2-inventory-what-shipped)
7. [Phase 3: Chunk Graph and Critical Path](#phase-3-chunk-graph-and-critical-path)
8. [Phase 4: Delivery Policy on the Wire](#phase-4-delivery-policy-on-the-wire)
9. [Phase 5: Asset Weight and Duplication](#phase-5-asset-weight-and-duplication)
10. [Severity Mapping](#severity-mapping)
11. [Audit Checklist](#audit-checklist)
12. [Cross-Audit Boundaries](#cross-audit-boundaries)
13. [Report Template](#report-template)
14. [Deliverables](#deliverables)

## Executive Summary

Every other audit in this catalog reads source code or configuration. This one reads the **artifact** and the **wire**: the files that ended up in `frontend/dist` and the container image, and the bytes and headers a browser actually receives. Nothing else in the catalog owns that surface, which is how the following all shipped past a full audit pass on 2026-07-18:

- A bundler silently applied a chunking config **partially** — two declared groups were never emitted, the framework runtime landed in a lazily-loaded chunk, and a custom plugin stripped the preload hint that would have saved it. Two serialized round trips before React was discoverable. **Zero change in total bytes**, so every size budget in the catalog passed.
- Source maps were written beside every chunk, copied into the image past `.dockerignore`, and served from `/assets/` at URLs derivable from any chunk name — the original TypeScript of a derived application downloadable by anyone who could reach the site. `grep -i 'sourcemap|build output|dist/'` across `SECURITY.md`, `DEPLOYMENT.md`, and `AUDIT_METHODOLOGY.md` returned one unrelated line.
- A target that serves its own static files from the application binary rather than nginx had **no compression and no cache headers at all**, and served `woff2`, `png`, and `ico` as `application/octet-stream`. The catalog's infrastructure checks named nginx-shaped scripts that did not exist there, so the whole dimension silently no-opped instead of failing.
- An 864 KB PNG, byte-duplicated across two directories, `<link rel=preload>`ed as a landing-page hero. 191 KB of legacy `.woff` fallbacks no browser capable of running the app would fetch. A 250 KB CommonMark parser statically imported into a route chunk for a dialog most visitors never open.

Not one of those is visible in a source diff, and only the last is visible in a total-bytes budget. Every one of them is plainly visible in the artifact.

## The Governing Rule

**Audit the artifact and the wire. Never the config that was supposed to produce them.**

A build config states intent. A `vite.config.ts` `manualChunks` callback that the bundler accepts, partly applies, and warns about nothing looks correct in review and is wrong in `dist`. An nginx `gzip on;` directive is not evidence a response was compressed. A `.dockerignore` entry is not evidence a file is absent from the image.

Every finding in this framework is a **difference between what the configuration says and what shipped**. If you cannot state a finding as "the config declares X, the artifact contains Y", you are auditing the wrong layer — that finding belongs to `FRONTEND.md`, `DEPLOYMENT.md`, or `PERFORMANCE.md`.

## Audit Scope

### In scope

- Contents of the built frontend output directory (`frontend/dist` or the project's equivalent) and of the runtime container image
- The emitted chunk graph, module preload hints, and entry static-import graph
- Response headers and encodings served by whichever process actually serves static bytes
- Asset weight by type, duplication, and format appropriateness (fonts, images, media)
- Files present in the artifact that were never meant to ship

### Out of scope

- Source-level import hygiene, `React.lazy` boundaries, component structure → `FRONTEND.md`
- Runtime metrics, Core Web Vitals, backend latency → `PERFORMANCE.md`
- Container orchestration, health checks, restart policy, observability → `DEPLOYMENT.md`
- Application authn/authz and input handling → `SECURITY.md`

## Instruments

This audit is deliberately **portable**: it requires no project-specific script. Its instruments are the artifact itself and HTTP requests against the running application, both of which exist in every target regardless of build tool or server. Record each per [AUDIT_METHODOLOGY.md](./AUDIT_METHODOLOGY.md) Phase 0.

| Instrument             | Kind     | How to obtain                                                                      |
| ---------------------- | -------- | ---------------------------------------------------------------------------------- |
| Built frontend output  | artifact | Run the project's production build; audit the emitted directory, not a stale one   |
| Build diagnostics      | log      | Capture the production build's full stdout **and** stderr; do not discard warnings |
| Container image layers | artifact | `docker create` the release image and inspect its filesystem, or `docker run … ls` |
| Served responses       | probe    | HTTP requests against the running application at the port it actually serves on    |
| Chunk import graph     | artifact | Parse the entry HTML and the emitted JS; see Phase 3                               |

The build log is an instrument, not noise. The governing rule below rejects auditing the config
_in place of_ the artifact; it does not license discarding the bundler's own report on that config.
A build that must be run to produce the artifact has already emitted this for free, and it is the
only instrument here that reports a defect **before** it reaches `dist`.

Where a target **does** ship a purpose-built gate — the template's `check:critical-path` is the reference implementation, and `PERFORMANCE.md` requires an equivalent — verify it is wired into a smoke mode or CI job before crediting it (Phase 0 assertion 2). A gate present in `package.json` and invoked by nothing has never run.

**If the production build cannot be produced at audit time, this audit is `SKIPPED / data-unavailable` with a High finding.** Do not substitute a dev build; a dev server emits unhashed, unminified, unsplit output and every check below is meaningless against it.

## Phase 1: Establish the Delivery Topology

Do this first. Every check in Phase 4 is scoped by its answer, and skipping it is what let an entire target go unaudited.

1. **Identify the process that serves static bytes in production.** Read the release `Dockerfile` / compose file / process manager config and determine which of these holds:
    - a reverse proxy or web server (nginx, Caddy) serving a copied `dist`
    - the application binary serving its own static directory
    - a CDN or object store in front of either
2. **Record it as an instrument record**, naming the file and line that establishes it.
3. **Do not assume the template's topology.** The frameworks in this catalog were written against a proxy-served layout. A target whose application binary serves its own assets has an entirely different set of enforcing code — the static-file handler in its server module — and that handler is what Phase 4 audits.

**Findings this phase produces:**

- The audit framework names a delivery instrument that does not exist in this target → **High**, per Phase 0. This is the finding, not a reason to narrow scope.
- No single process is identifiable as the static origin → **High**; an unknown origin cannot be audited and its policy is unknown to the team too.

## Phase 2: Inventory What Shipped

Enumerate every file in the built output and in the image's served directory, with size and type. Then ask what should not be there.

### Files that must not ship

| Class                     | Detection                                                             | Severity     |
| ------------------------- | --------------------------------------------------------------------- | ------------ |
| Source maps               | `*.map` present in the served directory or in the image               | **Critical** |
| Original sources          | `.ts`/`.tsx`/`.jsx` files, or `sourcesContent` inside any shipped map | **Critical** |
| Environment files         | `.env*` anywhere in the artifact or image                             | **Critical** |
| Backups / editor detritus | `*.bak`, `*.orig`, `*~`, `.DS_Store`, `Thumbs.db`                     | Low          |
| Development-only assets   | fixtures, seed data, test media                                       | Medium       |

Source maps rate **Critical** and not Medium because the exposure is not "stack traces are readable" — it is the complete original source of the application, retrievable by anyone who can fetch a chunk and append `.map`. Assess the two layers independently:

1. **Is the map in the artifact?** Build config decides this. A build that emits maps only under an explicit opt-in passes.
2. **Is the map reachable over HTTP?** The server decides this. A deny rule for `.map` is defence in depth and does not excuse emitting them.

Check the image separately from `dist`. A `.dockerignore` entry cannot filter a file that a multi-stage `COPY --from` pulls out of a build stage, which is precisely how maps reached a production image while the ignore file looked correct.

### Content types

For every distinct extension in the artifact, issue a request and compare the `Content-Type` against the correct type. A handler with a hardcoded extension map is the usual culprit and typically knows `css`, `js`, `html`, `svg` and nothing else — so `woff2`, `jpg`, `png`, `ico`, and `webmanifest` fall through to `application/octet-stream`.

Consequences are not cosmetic: `application/octet-stream` defeats content-based compression rules, can defeat font loading, and can turn a navigable asset into a download. **Medium**, or **High** where it breaks a render-blocking resource.

## Phase 3: Chunk Graph and Critical Path

This phase catches the class of regression that is **invisible to every size budget**, because it moves bytes between chunks without changing their total.

### Definitions

The **critical path** is: the entry module, every chunk the entry HTML declares as `modulepreload`, and every render-blocking stylesheet — measured in the encoding actually served (brotli where the server negotiates it, else gzip, else raw). Lazy and prefetched chunks are excluded by definition.

This is a real definition with a real measurement procedure. "The size of the main JS file" is not it, and reading it that way is how a broken build passed a "critical-path ≤ 170 KB" budget.

### The three assertions

Run all three against the built artifact. Each catches a distinct failure and none implies the others:

1. **Budget** — total compressed bytes of the critical path stay under the project's recorded budget. Catches growth.
2. **Runtime placement** — the framework runtime (React itself, identified by markers present in its production build and absent from the renderer) lives in a chunk the entry HTML preloads. Catches late discovery.
3. **Waterfall** — the entry chunk never _statically_ imports a chunk that is not preloaded. That combination is a serialized round trip by definition: the browser cannot know it needs the chunk until it has fetched and parsed the entry. Catches the round trip directly.

The 2026-07-18 build failed assertions 2 and 3 while **passing** assertion 1 at 197.08 KB against a 205 KB budget. An audit that ran only the budget would have reported the build clean, which is exactly what happened.

### Declared groups versus emitted chunks

Diff the chunk groups the build config declares against the chunks actually present in the output. A modern bundler may accept a legacy config shape, apply it partially, and warn about nothing.

- A declared group with no corresponding emitted chunk → **High**. The config is a fiction and the modules went somewhere unintended.
- Any custom build plugin that _removes_ or rewrites preload hints, integrity attributes, or import statements → inspect it and justify it in the report. A plugin that suppresses a browser hint is fighting the platform, and once placement is correct it usually has nothing left to do. If it is retained, the report must state what it strips and why.

### Deprecated and ignored build options

Read the build log captured in Phase 0. A bundler that names one of its own options **deprecated**,
**ignored**, or **superseded** is reporting the same defect as a missing chunk group, ahead of time:
the option still applies today and stops applying on some future upgrade, at which point every group
it declares silently disappears. That is a lagging check turned into a leading one, and it is free.

- Build emits a deprecation or ignored-option warning for an option that **controls chunking,
  preloading, or asset emission** → **High**. Removal of that option reverts the chunk graph without
  touching a line of application code, and the Phase 3 assertions above will only notice afterwards.
- Any other deprecation warning in the build log → Medium.
- Two options set where the tool documents that one **overrides or ignores** the other → **High**
  regardless of deprecation status. The config states two intents and the build honours one; which
  one is a property of the tool version, not of the repository.

Do not accept "it still builds" as a resolution. The finding is that the artifact's correctness now
depends on a deprecated code path, and the remediation is to migrate to the supported option and
re-verify the emitted chunk graph is unchanged — diff the chunk names before and after, since a
silently-different grouping is the exact failure this phase exists to catch.

### Reference implementation

The template ships `scripts/check-critical-path.ts` implementing all three assertions with a `--update-budget` regeneration path, wired into the build smoke mode. Read it before writing a bespoke equivalent. `PERFORMANCE.md` requires an equivalent gate in every target; **its absence in this target is a High finding here**, since without it Phase 3 has no regression signal between audits.

## Phase 4: Delivery Policy on the Wire

Measure by request. A config directive is not evidence, and this phase is scoped by the topology recorded in Phase 1 — audit the enforcing handler for **this** target's origin.

### Compression

For each text-bearing type served (`js`, `css`, `html`, `svg`, `json`, `webmanifest`), request it both with and without an `Accept-Encoding` offer and record the `Content-Encoding` returned and the transferred size.

- Text asset returned uncompressed when the client offered an encoding → **High**
- Already-compressed formats (`woff2`, `jpg`, `png`, `webp`, `avif`, `gz`, `br`, `zst`) re-compressed → Low; wasted CPU, no gain
- Very small bodies compressed → informational; a floor around 1 KB is normal and correct
- Compression ratio below ~70% on text → Medium; usually indicates a stale or misconfigured encoder

### Caching

| Asset class                                  | Required policy                     | Violation |
| -------------------------------------------- | ----------------------------------- | --------- |
| Content-hashed assets (`/assets/*.<hash>.*`) | Long max-age, `immutable`           | **High**  |
| Unhashed root files (icons, manifest)        | Short max-age with revalidation     | Medium    |
| Entry HTML                                   | `no-store` (or strict revalidation) | **High**  |

The entry HTML rule is the one teams get backwards, and it is load-bearing in both directions: a cached entry document pins stale chunk hashes and produces 404s on deploy, while a `no-store` applied to hashed assets means **nothing is ever cached** and every visit is a cold load.

That second failure is a specific, recurring trap: a blanket `no-store` default set by a security-headers layer will silently apply to static assets unless the static handler is exempted. Where a target has such a default, verify the exemption exists in the handler and cite its `file:line` — a security default suppressing all caching is a **High** performance finding, not an acceptable trade.

### Repeat-visit behaviour

Request the entry document, then re-request every asset it references with the validators from the first response. A correctly configured origin fetches **nothing** but the entry document on a repeat visit. Anything else is a finding with a measured byte count attached.

## Phase 5: Asset Weight and Duplication

Report weight by type — JS, CSS, fonts, images, media — for the artifact as a whole and for the first page load specifically. JS is the type this catalog historically measures; it is routinely not the largest.

### Images

- Any image over 200 KB → justify the format. Photographic and rendered artwork with no crisp text belongs in a lossy format; measure the substitution (SSIM/PSNR or a visual diff) rather than asserting it is fine.
- Any image `<link rel=preload>`ed or used as an above-the-fold background counts against **first paint**, not just page weight. Weigh it accordingly and state it that way in the finding.
- Byte-identical files at two or more paths → Medium. Hash the artifact and report duplicates; social-preview and hero images are the common case.

### Fonts

- Legacy formats (`.woff`, `.ttf`, `.eot`) shipped alongside `.woff2` → **High**. No browser that can run a modern React application lacks `woff2`; these bytes are unreachable by construction. Package-provided stylesheets are the usual source, since they list a legacy fallback after the modern source.
- Fixed-weight face sets where a variable face covers the range → Medium, with the byte delta measured.
- Subsets shipped that the application does not render → Medium. Conversely, check for **missing** coverage: a face whose subset omits glyphs the app renders falls back mid-line to a system font, which is a visible defect rather than a weight one.
- Faces synthesised by the browser because no matching weight was loaded → Medium; the requested weight renders as a faux-bold approximation.

### Route payloads

For each route chunk, identify any dependency that is large relative to the chunk and reachable only through a conditionally rendered subtree — a viewer, editor, chart, or parser behind a dialog or tab. A statically imported dependency ships to every visitor of that route whether or not the subtree ever mounts.

State the finding with both numbers: the dependency's contribution and the route's before/after. **Medium** normally; **High** where the dependency exceeds the rest of the route combined.

## Severity Mapping

| Finding                                                                 | Severity                        |
| ----------------------------------------------------------------------- | ------------------------------- |
| Source maps, original sources, or `.env` files reachable over HTTP      | **Critical**                    |
| Source maps or `.env` files present in the image but not served         | **High**                        |
| Framework runtime not in a preloaded chunk                              | **High**                        |
| Entry statically imports a non-preloaded chunk                          | **High**                        |
| Declared chunk group not present in the emitted output                  | **High**                        |
| Deprecated build option controlling chunking, preload, or emission      | **High**                        |
| Two build options set where the tool ignores one in favour of the other | **High**                        |
| Other deprecation warnings in the build log                             | Medium                          |
| Text assets served uncompressed                                         | **High**                        |
| Content-hashed assets not immutably cacheable                           | **High**                        |
| Entry HTML cacheable                                                    | **High**                        |
| Legacy font formats shipped beside `woff2`                              | **High**                        |
| No critical-path gate wired into a smoke mode or CI                     | **High**                        |
| Critical path over budget                                               | High / Medium by margin         |
| Incorrect `Content-Type` on a served asset                              | Medium, High if render-blocking |
| Heavy dependency statically imported behind a conditional subtree       | Medium, High if dominant        |
| Byte-identical duplicate assets                                         | Medium                          |
| Oversized or unjustified image format                                   | Medium, High if preloaded       |
| Redundant font subsets or fixed-weight sets                             | Medium                          |
| Already-compressed formats re-compressed                                | Low                             |
| Editor/backup detritus in the artifact                                  | Low                             |

## Audit Checklist

**Phase 0 / topology**

- [ ] Production build produced at audit time; no stale or dev output audited
- [ ] Static-file origin identified and cited `file:line`
- [ ] Every instrument recorded with a `verified` outcome

**Artifact**

- [ ] No `*.map`, source files, or `.env*` in the served directory **or** the image
- [ ] `.map` requests denied by the origin
- [ ] Correct `Content-Type` for every extension present

**Chunk graph**

- [ ] Critical path defined as entry + modulepreloads + blocking CSS, measured compressed
- [ ] Critical path within recorded budget
- [ ] Framework runtime in a preloaded chunk
- [ ] Entry statically imports no non-preloaded chunk
- [ ] Every declared chunk group present in the emitted output
- [ ] Build log captured; no deprecated or ignored option governs chunking, preload, or emission
- [ ] Custom preload/import-rewriting plugins inventoried and justified
- [ ] A gate asserting the three structural checks is wired into a smoke mode or CI

**Delivery**

- [ ] Text assets negotiated and compressed; ratio ≥70%
- [ ] Hashed assets immutable; entry HTML `no-store`
- [ ] Security-header defaults do not suppress asset caching
- [ ] Repeat visit fetches only the entry document

**Weight**

- [ ] Weight reported by type, not JS alone
- [ ] No legacy font formats; variable faces where they cover the range
- [ ] Preloaded and above-the-fold images justified and measured
- [ ] No byte-identical duplicates
- [ ] No heavy dependency statically imported behind a conditional subtree

## Cross-Audit Boundaries

- **[PERFORMANCE.md](./PERFORMANCE.md)** — runtime behaviour and Core Web Vitals. It owns _how fast the application runs_; this audit owns _what it ships and how it is served_. Its Phase 4 delegates the delivery measurement here.
- **[FRONTEND.md](./FRONTEND.md)** — source-level structure, lazy boundaries, component patterns. Findings that read as "this import should be dynamic" originate here as artifact evidence and are remediated in source.
- **[DEPLOYMENT.md](./DEPLOYMENT.md)** — the container's runtime behaviour, health, and observability. It owns the deployed _process_; this audit owns the _bytes inside the image_.
- **[SECURITY.md](./SECURITY.md)** — application attack surface. Artifact-leak findings (source maps, `.env`, sources) are raised here and cross-referenced there; they are inside no other framework's scope.
- **[LIGHTHOUSE.md](./LIGHTHOUSE.md)** — lab measurement, where a target performs it.

## Report Template

```markdown
# BUILD_OUTPUT Audit Report - YYYY-MM-DD

## Instrument Validation (Phase 0)

| name | kind | target | evidence | measured | verified |
| ---- | ---- | ------ | -------- | -------- | -------- |

**Status**: [MEASURED | SKIPPED / data-unavailable]

## Delivery Topology

- Static origin: [nginx | application binary | CDN] — cited at [file:line]
- Build audited: [commit / build id, produced at YYYY-MM-DDTHH:MMZ]

## Artifact Inventory

| Type | Files | Raw | Served |
| ---- | ----- | --- | ------ |

**Must-not-ship classes present**: [none | list]

## Critical Path

- Entry + modulepreloads + blocking CSS: [X] KB [encoding] against budget [Y] KB
- Framework runtime preloaded: [yes/no — chunk name]
- Entry static imports outside preload set: [none | list]
- Declared groups missing from output: [none | list]
- Deprecated/ignored build options in the build log: [none | option → supported replacement]

## Delivery Policy

| Asset class | Content-Encoding | Cache-Control | Verdict |
| ----------- | ---------------- | ------------- | ------- |

Repeat-visit fetches beyond the entry document: [none | list with bytes]

## Findings

| ID  | Severity | Finding | Evidence | Remediation |
| --- | -------- | ------- | -------- | ----------- |
```

## Deliverables

- Audit report at `.aidd/audit-reports/BUILD_OUTPUT-YYYY-MM-DD.md` following the template above.
- One `feature.json` per finding in `.aidd/features/`, severity per [SEVERITY_CLASSIFICATION.md](./SEVERITY_CLASSIFICATION.md), each carrying the artifact path or the captured request/response that evidences it.
- The artifact inventory and the header capture, retained so the next audit can diff against them rather than re-establishing a baseline.
