---
title: 'Watermark, Steganography, and Covert Telemetry Audit'
last_updated: '2026-08-19'
version: '1.1'
category: 'Security'
priority: 'High'
estimated_time: '2-4 hours'
frequency: 'Per release and after generated-asset changes'
lifecycle: 'pre-release'
---

# Watermark, Steganography, and Covert Telemetry Audit

> Use [SEVERITY_CLASSIFICATION.md](./SEVERITY_CLASSIFICATION.md) for prioritization and
> [AUDIT_METHODOLOGY.md](./AUDIT_METHODOLOGY.md) for evidence and validation gates.

This audit finds provider provenance, hidden payloads, and telemetry in source, shipped artifacts,
and bounded Git history. Ordinary AI-assistance is not a defect. Statistical text watermarks and
C2PA credentials require a publication decision; neither identifies an author, user, or session.

## Executive Summary

Validate each scanner before trusting it, distinguish covert payloads from provider provenance,
and preserve honest coverage limits. If no official compatible statistical-text detector is
available, that subsection is unverified and the overall verdict is `PARTIAL`, never `PASS`.

## Table of Contents

1. [Posture and Scope](#posture-and-scope)
2. [Phase 0: Validate the Instruments](#phase-0-validate-the-instruments)
3. [Text and Unicode Carriers](#1-text-and-unicode-carriers)
4. [Statistical Text Watermarks](#2-statistical-text-watermarks)
5. [Media and Binary Artifacts](#3-media-and-binary-artifacts)
6. [Network Beacons and Telemetry](#4-network-beacons-and-telemetry)
7. [Identifiers and Encoded Payloads](#5-identifiers-and-encoded-payloads)
8. [DOM, HTML, and CSS Carriers](#6-dom-html-and-css-carriers)
9. [Advisory Fingerprints](#7-advisory-fingerprints)
10. [Provenance Inventory](#8-provenance-inventory-record-only)
11. [Break-the-Assumption Checks](#break-the-assumption-checks-mandatory)
12. [Severity and Finding Rules](#severity-and-finding-rules)
13. [Report Template and Deliverables](#report-template-and-deliverables)

## Posture and Scope

Classify observations before filing findings:

- **Covert or steganographic payloads are findings**: invisible Unicode payloads,
  variation-selector smuggling, or patterned trailing-whitespace channels.
- **Covert channels are findings**: tracking pixels, undocumented outbound beacons, planted
  endpoints, or runtime payload reconstruction. These are security issues regardless of origin.
- **Machine-readable provider provenance needs an operator decision**: statistical text
  watermarks and C2PA content credentials are findings only when they ship without approval or
  conflict with publication/customer policy.
- **Overt provenance is inventory only**: `.aidd/`, `.claude/`, `CLAUDE.md`, `AGENTS.md`, AI
  co-author trailers, and template-version markers produce no findings in default mode.

Default scope covers tracked, untracked, ignored, generated, and release-staged content. Use
`rg -uu`, excluding `.git/**` and `node_modules/**` from broad sweeps; inspect dependency code when
it is bundled or executed. Derive shipped scope from manifests, release scripts, container files,
public directories, and build output.

History defaults to shipped-media and public-copy paths. Record `bounded`, `full`, or `skipped`
with exact paths/object counts; an unstated cut invalidates the report. Keep private target names
and literal secret patterns in ignored `.aidd/` artifacts.

Optional **publication-review mode** turns overt provenance into a per-item operator decision
list. Never remove markers without explicit approval.

Never send private source, prompts, or unpublished copy to a remote detector without explicit
approval. Prefer official local detection; otherwise use already-public copy only.

### Cross-Audit Boundaries

- [SECURITY.md](./SECURITY.md) owns general security; this audit owns covert carriers.
- [OUTBOUND_SSRF.md](./OUTBOUND_SSRF.md) owns destination validation; this audit owns planted,
  undocumented, or beacon-shaped calls.
- [BUILD_OUTPUT.md](./BUILD_OUTPUT.md) establishes shipped scope. [HYGIENE.md](./HYGIENE.md) owns
  incidental formatting; whitespace belongs here only when it supports a channel.

## Phase 0: Validate the Instruments

A clean result requires the same scanner and flags to detect seeded controls. Create canaries in
ignored `.aidd/tmp/`, remove them afterward, and record pass/fail per instrument:

```bash
bun -e "import { mkdir } from 'node:fs/promises'; await mkdir('.aidd/tmp', { recursive: true }); await Bun.write('.aidd/tmp/wm-canary.txt', 'A\u200bB \u2062 C\ufeff\nD  \nX\u{e0041}\u{e0042}Y\n'); await Bun.write('.aidd/tmp/wm-canary.png', Buffer.from('\x89PNG\r\n\x1a\nIHDRcaBXc2pa.watermarked', 'latin1'))"
rg -n '[\x{200B}-\x{200F}\x{2060}-\x{2064}\x{FEFF}]' .aidd/tmp/wm-canary.txt
rg -n '[\x{E0000}-\x{E007F}]' .aidd/tmp/wm-canary.txt
rg -n ' +$' .aidd/tmp/wm-canary.txt
rg -a -n 'IHDR|caBX|c2pa\.watermarked' .aidd/tmp/wm-canary.png
```

All probes must hit. Record versions for `rg`, `git`, `exiftool`, and `c2patool`. Missing metadata
tools permits byte fallbacks; a failed canary blocks its section. Validate any metadata tool used
as deciding evidence against a known-positive fixture. Detector unavailability is a coverage
limit, not a failed canary.

## 1. Text and Unicode Carriers

Run broad sweeps with `-uu -g '!node_modules/**' -g '!.git/**'` and triage every hit:

```bash
rg -uu -n '[\x{200B}-\x{200F}\x{202A}-\x{202E}\x{2060}-\x{2064}\x{FEFF}]' -g '!node_modules/**' -g '!.git/**' .
rg -uu -n '[\x{E0000}-\x{E007F}]' -g '!node_modules/**' -g '!.git/**' .
rg -uu -n '[\x{00AD}\x{3164}\x{FFA0}]' -g '!node_modules/**' -g '!.git/**' .
rg -uu -n '[\x{00A0}\x{2000}-\x{200A}\x{202F}\x{205F}\x{3000}]' --glob '*.{ts,tsx,js,json,md}' -g '!node_modules/**' -g '!.git/**' .
rg -uu -n '[\x{FE00}-\x{FE0F}]|[\x{E0100}-\x{E01EF}]' -g '!node_modules/**' -g '!.git/**' .
rg -uu -n '[\p{Cyrillic}\p{Greek}\x{FF01}-\x{FF5E}]' --glob '*.{ts,tsx,js,json}' -g '!node_modules/**' -g '!.git/**' .
rg -uu -n ' +$' --glob '*.{ts,tsx,js,md,json}' -g '!node_modules/**' -g '!.git/**' .
```

- Any tag-block hit is a finding. No ordinary repository content needs U+E0000-U+E007F.
- Justify invisible, BOM, filler, NBSP, and homoglyph hits by function and location.
- Verify variation selectors against preceding codepoints; emoji use is benign, encoded bits are
  findings.
- Incidental trailing spaces are Low hygiene; patterned or decodable distributions are High.

## 2. Statistical Text Watermarks

Claude's supported watermark is a key-dependent token-choice pattern that adds no tokens or hidden
characters. Unicode scans, style tells, generic detectors, and SynthID without Anthropic's
compatible key cannot verify it.

Inventory likely provider-generated prose, translations, summaries, docs, and comments. Mark
short, factual, proofread, or code-heavy samples weak-signal because length and entropy matter.

- Without an official compatible detector, record
  `UNVERIFIABLE — official compatible detector unavailable`; use overall verdict `PARTIAL` and
  create no finding solely for detector unavailability.
- With a detector, prove it distinguishes official positive/negative fixtures. Record version,
  passage/token length, score/confidence, threshold, and abstention under the privacy boundary.
- Positive means likely Claude involvement, not authorship, identity, or session. Negative does
  not prove human authorship; light edits may preserve signal, while complete rewriting can remove
  it.

Use [Anthropic's Claude text watermark announcement](https://www.anthropic.com/news/claude-text-watermark)
for provider behavior and the [SynthID-Text paper](https://www.nature.com/articles/s41586-024-08025-4)
for detector limits. Re-check both because detector availability can change.

## 3. Media and Binary Artifacts

Enumerate every shipped raster, SVG, font, document, audio, and video asset. Record one row per
asset, including release-script sources, public derivatives, staged archives, and generated output.

```bash
rg --files -uu -g '!node_modules/**' -g '!.git/**' -g '*.{png,jpg,jpeg,webp,gif,ico,svg,woff,woff2,ttf,otf,pdf,mp3,wav,ogg,m4a,mp4,webm,mov}' .
rg -uu -a -l 'caBX|c2pa|jumbf|JUMBF|c2pa\.watermarked' --glob '*.{png,jpg,jpeg,webp,svg}' -g '!node_modules/**' -g '!.git/**' .
rg -uu -a -n 'tEXt|iTXt|zTXt|eXIf|Exif|ns\.adobe\.com/xap|photoshop|openai|DALL' --glob '*.{png,jpg,jpeg,webp}' -g '!node_modules/**' -g '!.git/**' .
rg -uu -n '<metadata|inkscape:|sodipodi|dc:creator|<desc' --glob '*.svg' -g '!node_modules/**' -g '!.git/**' .
```

Use `c2patool <asset>` for C2PA content credentials and `exiftool <asset>` for metadata when
available. C2PA credentials are signed open provenance metadata, not invisible watermarks;
record the operator's publication decision for every credential. A `c2pa.watermarked` assertion
describes an assertion inside the credential and does not change that classification.
With fallbacks, record `rg -a -b -o` offsets. Compare shipped-font hashes to upstream, allowing
proved subsetting/transformation. SVG creator IDs, UUIDs, or unexplained provenance are Medium;
structural IDs are benign.

For bounded history, enumerate shipped-path blobs with `git rev-list --all --objects`, retain blobs
with `git cat-file --batch-check`, and repeat binary/text probes. Record path sets, unique counts,
and hits; `--history full` applies them to every blob.

## 4. Network Beacons and Telemetry

Build a complete runtime-egress inventory and trace every host to a documented feature and caller:

```bash
rg -uu -o 'https?://[A-Za-z0-9._:/-]+' --glob '*.{ts,tsx,js,json,html,ps1}' -g '!node_modules/**' -g '!*.lock' .
rg -uu -n 'fetch\(|axios|XMLHttpRequest|sendBeacon|WebSocket\(|Invoke-WebRequest|Invoke-RestMethod' -g '!node_modules/**' -g '!.git/**' .
rg -uu -n 'new Image\(|width=[\x{22}\x{27}]?1[\x{22}\x{27}]?|height=[\x{22}\x{27}]?1[\x{22}\x{27}]?|\.gif\?' --glob '*.{ts,tsx,js,jsx,html}' -g '!node_modules/**' -g '!.git/**' .
rg -uu -n 'posthog|segment|sentry|mixpanel|amplitude|plausible|umami' -g 'package.json' -g 'bun.lock' -g 'package-lock.json' -g 'pnpm-lock.yaml' -g 'yarn.lock' .
rg -uu -o 'https?://[a-z0-9.-]+' -g 'bun.lock' -g 'package-lock.json' -g 'pnpm-lock.yaml' -g 'yarn.lock' .
```

External tracking pixels and undocumented beacons are Critical. Prove whether telemetry-shaped
dependencies execute in the bundle and trace their hosts. Do not duplicate `OUTBOUND_SSRF` issues.

## 5. Identifiers and Encoded Payloads

```bash
rg -uu -n '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\b[0-9a-f]{32,64}\b' --glob '*.{ts,tsx,js,json}' -g '!node_modules/**' -g '!*.lock' .
rg -uu -n '[A-Za-z0-9+/]{80,}={0,2}|data:[a-z/+;]*base64,' -g '!node_modules/**' -g '!*.lock' .
rg -uu -n 'eval\(|Function\(|String\.fromCharCode|atob\(' --glob '*.{ts,tsx,js}' -g '!node_modules/**' .
rg -uu -ni 'session[-_ ]?id|request[-_ ]?id|conversation|generated with|<ai>|chatgpt|copilot' --glob '*.{ts,tsx,js,md}' -g '!node_modules/**' -g '!CHANGELOG*' .
```

Trace constants to a producer and decode blobs/`data:` URIs. Untraceable values are Medium;
runtime reconstruction of executable code or URLs is Critical until proved benign.

## 6. DOM, HTML, and CSS Carriers

```bash
rg -uu -n 'type=[\x{22}\x{27}]hidden|display:\s*none|visibility:\s*hidden|opacity:\s*0' --glob '*.{tsx,jsx,html,css}' -g '!node_modules/**' -g '!.git/**' .
rg -uu -n 'content:\s*[\x{22}\x{27}][^\x{22}\x{27}]*\\[0-9a-fA-F]{4,6}' --glob '*.{css,tsx,jsx}' -g '!node_modules/**' -g '!.git/**' .
rg -uu -n '<meta\s|data-[a-z-]+=' --glob '*.{tsx,jsx,html}' -g '!node_modules/**' -g '!.git/**' .
rg -uu -n '<!--' --glob '*.html' -g '!node_modules/**' -g '!.git/**' .
```

Map hidden nodes and metadata to UI functions. Traceable icon escapes are benign; encoded strings,
hidden identifiers, unexplained meta tags, and nonfunctional hidden nodes require investigation.

## 7. Advisory Fingerprints

These searches are narrative advisories, not covert-channel findings or watermark detection.
Style never proves origin; file only when the structure is also a covert carrier.

```bash
rg -uu -niw 'delve|tapestry|seamless|seamlessly|testament to|cutting-edge|in the realm of|it.s worth noting' -g '!node_modules/**' -g '!.git/**' .
rg -uu -n 'Generated with|Powered by AI|As an AI' -g '!node_modules/**' -g '!.git/**' -g '!.aidd/**' .
rg -uu -n '[\x{2018}\x{2019}\x{201C}\x{201D}\x{2014}]' --glob '*.{ts,tsx,js,json}' -g '!node_modules/**' -g '!.git/**' .
```

## 8. Provenance Inventory (Record Only)

Record `.aidd/`, `.claude/`, agent instructions, AI co-author trailers, and template markers with
no default findings. Publication mode records `ship`, `do not ship`, or `undecided`; the operator
decides.

```bash
rg --files -uu -g '!.git/**' | rg '(^|/)(\.aidd|\.claude)(/|$)|(^|/)(CLAUDE|AGENTS)\.md$'
git log --format='%b' | rg -c 'Co-Authored-By: Claude|Generated with \[Claude Code\]'
rg -uu -l 'spernakit_version' .aidd/features
```

## Break-the-Assumption Checks (Mandatory)

Each scenario ends `passed` or `blocked`, with deciding evidence:

1. **The image is just an asset.** Byte-scan every shipped raster and record every asset.
2. **The grep was clean.** Cite the matching Phase 0 canary result beside every clean sweep.
3. **That hash is a build artifact.** Cite the producer for every constant dispositioned benign.
4. **The current tree is clean.** Complete the bounded historical sweep and state its limits.
5. **It is a trusted dependency.** Prove whether telemetry-shaped dependency code is bundled,
   executed, and capable of egress; trace any host.
6. **The Unicode scan was clean, so prose is unwatermarked.** Statistical token-choice patterns
   add no characters and require a validated compatible detector.
7. **A positive mark proves who wrote it.** It supports likely provider involvement only, not an
   author, user, organization, or session.
8. **No mark means no AI.** Short, factual, code-heavy, edited, or rewritten text can have weak,
   absent, or removed signal; record detector limits and abstentions.

Missing per-asset evidence, failed canaries, unstated history cuts, or unsupported benign
dispositions make the report `INCOMPLETE`.

## Severity and Finding Rules

- **Critical**: active telemetry/beacon to an undocumented host, tracking pixel, or runtime
  payload-reconstruction chain.
- **High**: unapproved or policy-conflicting C2PA content credential in a shipped asset;
  confirmed statistical watermark that violates publication policy; Unicode tag payload;
  confirmed invisible or whitespace channel; or hidden DOM/meta carrier with an identifier.
- **Medium**: generator-bearing EXIF/text/XMP residue, SVG creator metadata, homoglyph identifier,
  untraceable constant, opaque encoded blob, or unexplained modified font.
- **Low**: incidental whitespace/BOM/punctuation hygiene or dense linguistic advisory.

Do not file overt provenance or proved benign functional artifacts; retain falsification evidence.

For each confirmed finding, create
`.aidd/features/audit-watermark-{unix_timestamp}-{slug}/feature.json` per
[SEVERITY_CLASSIFICATION.md](./SEVERITY_CLASSIFICATION.md), with `auditSource: "WATERMARK"`, the
mapped `auditSeverity` and `priority`, `category: "Audit"`, `passes: false`, and `id` exactly
matching the directory. Put concrete evidence in `description` and remediation plus exact
re-verification in `spec`.

## Report Template and Deliverables

Write `.aidd/audit-reports/WATERMARK-YYYY-MM-DD.md`:

Verdict precedence is `FINDINGS` for any confirmed finding, then `INCOMPLETE` for failed required
instrumentation/evidence, then `PARTIAL` for stated detector unavailability, otherwise `PASS`.

Start with `# WATERMARK Audit Report - <repo> @ <commit-sha>` and record date, mode, and verdict
(`PASS`, `FINDINGS`, `PARTIAL`, or `INCOMPLETE`). Include these sections:

| Section                           | Required evidence                                                        |
| --------------------------------- | ------------------------------------------------------------------------ |
| Phase 0 Instrument Record         | Instrument, version/flags, canary result, trusted status                 |
| Scope Record                      | Included paths, release topology, history mode/count, binary tooling     |
| Statistical Text Watermark Record | Candidate, privacy, length, detector/version, score/threshold, result    |
| Per-Asset Record                  | Asset, ship path, C2PA credential, metadata, operator decision, evidence |
| Checklist Results                 | Section, check, result, deciding evidence                                |
| Break-the-Assumption Record       | Scenario, outcome, deciding evidence                                     |
| Provenance Inventory              | Default inventory or per-item publication decision                       |
| Findings                          | Severity, evidence, impact, remediation, re-verification, feature ID     |

Deliver the report, statistical-text record, per-asset inventory, bounded/full-history evidence,
provenance inventory, and one valid `feature.json` per confirmed finding. Remediate provider
provenance through operator approval/documentation/disclosure or genuinely operator-authored
replacement when policy requires it; do not recommend generic watermark removers. Success
requires valid canaries, honest statistical coverage, per-asset results, falsified benign
dispositions, stated scope cuts, and exact re-verification for every finding.
