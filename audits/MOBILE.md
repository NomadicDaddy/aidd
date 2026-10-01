---
title: 'Mobile Application Audit - Expo and React Native'
last_updated: '2026-10-01'
version: '1.0'
category: 'Core Technology'
priority: 'High'
estimated_time: '2-4 hours'
frequency: 'Per-release'
lifecycle: 'pre-release'
description: 'Expo and React Native application audit: app config, native dependencies, gates, measured performance, local data, offline behavior, build profiles and signing, OTA updates, store readiness, accessibility, security, device coverage, and release artifacts'
---

# Mobile Application Audit: Expo and React Native

> **Severity Reference**: See [SEVERITY_CLASSIFICATION.md](./SEVERITY_CLASSIFICATION.md) for issue prioritization.
> **Methodology gate**: See [AUDIT_METHODOLOGY.md](./AUDIT_METHODOLOGY.md): validate every instrument before reading it, read the enforcing implementation (cite file:line), falsify every "by design"/"N/A" rationale, never score from a green gate.

Audits an Expo or React Native application from its config to its store release. Most of what makes
a mobile release safe lives outside the JavaScript: signing, update channels, store declarations
and behavior on a real device. This audit checks those by reading configuration and recorded
evidence, and it checks performance and absence claims only against a stated instrument.

## Table of Contents

- [What the Auditor Must Never Do](#what-the-auditor-must-never-do)
- [Applicability Gate](#applicability-gate)
- [Evidence Rules](#evidence-rules)
- [Pre-Audit Setup](#pre-audit-setup)
- [1. App Config](#1-app-config)
- [2. Dependency and Native Module Hygiene](#2-dependency-and-native-module-hygiene)
- [3. Gates](#3-gates)
- [4. Performance, Stated as Numbers](#4-performance-stated-as-numbers)
- [5. Data and State](#5-data-and-state)
- [6. Offline Honesty](#6-offline-honesty)
- [7. Build Profiles and Signing](#7-build-profiles-and-signing)
- [8. OTA Updates](#8-ota-updates)
- [9. Store Submission Readiness](#9-store-submission-readiness)
- [10. Accessibility](#10-accessibility)
- [11. Security](#11-security)
- [12. Device Matrix](#12-device-matrix)
- [13. Release Artifacts](#13-release-artifacts)
- [BREAK-THE-ASSUMPTION (mandatory)](#break-the-assumption-mandatory)
- [Audit Checklist](#audit-checklist)
- [Report Template](#report-template)
- [Deliverables](#deliverables)
- [Success Criteria](#success-criteria)

## What the Auditor Must Never Do

These limits hold for every section. An audit that breaks one is invalid whatever it found.

- **Never build for a store or submit to one.** No store-profile build, no upload, no submission,
  no promotion between tracks.
- **Never publish an OTA update**, and never republish, roll back or change a channel or branch
  mapping. Rollback is verified from the documented procedure and the record of a past rehearsal.
- **Never touch signing material or store accounts.** Do not create, open, download, move, rotate
  or delete a keystore, certificate, provisioning profile, service key or store credential. Do not
  sign in to a store console or a build service account.
- **Never read a secret value.** Confirm that a secret exists, where it is stored and what reads
  it, by name and location only. List file names; do not open key files or print environment
  values.
- **Never change the target to make a check pass.** A dependency fix, a config edit or a version
  bump is a finding with a remediation, not something the audit applies.

Sections 7, 8 and 9 are verified by reading configuration and recorded evidence (CI logs, build
service records, release notes, store listing exports the project keeps). Record each of those
checks as **traced**, never **executed**. Missing permission to execute is not a defect in the
target. Missing evidence is: when the project keeps no record that a control ran, report that.

## Applicability Gate

Run this first. The audit applies only when the target is an Expo or React Native application.

| Evidence                 | Where to look                                                                    | Counts as                                               |
| ------------------------ | -------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `expo` or `react-native` | `dependencies` or `devDependencies` of the root manifest and every nested one    | In scope                                                |
| App config               | `app.json` with an `expo` key, or `app.config.js` / `app.config.ts`              | Supporting evidence; also locates the app's root folder |
| Native projects          | `android/` or `ios/` directories beside the app config                           | Supporting evidence; see section 2 on prebuild drift    |
| None of the above        | Every `package.json` outside `node_modules`, and a search for an app config file | Whole audit N/A                                         |

```bash
# Every project manifest that names either package (nested workspaces included)
grep -lE '"(expo|react-native)"[[:space:]]*:' --include=package.json -r . --exclude-dir=node_modules

# App config files
git ls-files | grep -E '(^|/)app\.(json|config\.(js|ts|mjs|cjs))$'
```

When nothing matches, record the whole audit as **N/A** with the command output as evidence, and
write the falsification record AUDIT_METHODOLOGY Rule 2 requires: the scenario is a mobile app kept
in a nested workspace that a root-only check would miss, and the record shows every manifest was
searched. Do not record N/A from a project description or a stack label. A repository that holds a
mobile app beside other code is in scope for the mobile app's folder only; state that folder.

When aidd selects audits for a project, the package requirement in `audit-profile-mapping.json` may
already have filtered this audit out. This gate still runs when the audit is invoked by name.

## Evidence Rules

Two rules apply to every section below. They restate the methodology for the two places a mobile
audit most often goes wrong.

**A budget is a number with an instrument.** A performance claim counts only when it states the
number, the unit, the statistic (for example p90), the instrument that measured it, the device
model and OS version, and the build type. Touch latency and startup time must be measured on a
physical device running a development build or a release build. A simulator or emulator figure
does not count for either, and neither does a figure from a web preview. "Feels fast" and "no
jank observed" are not evidence. The audit does not invent a budget the project never stated: a
missing budget is the finding.

**An absence claim needs a known-positive control first.** Before reporting "no network use", "no
secrets in storage", "no committed key files" or "no console output", prove the search can find
the thing. Run the same search against a case known to contain a hit (a fixture the project
keeps, or a throwaway file outside the tracked tree that you delete afterwards), record that it
matched, then run it against the target. A search that was never shown to match anything proves
nothing, and its empty result must not be reported as a pass.

Each command or tool named in this audit (`expo-doctor`, `expo install --check`, the project's
gates, a profiler, a search used for an absence claim) is an instrument. Give each an instrument
record under Phase 0 of the methodology. An instrument that is missing, not wired into a gate, or
not measuring what it claims is a **High** finding, not reduced scope.

## Pre-Audit Setup

1. Read the target's own instructions, its app config, `eas.json` when present, and its
   `package.json` scripts. Read what the project documents about budgets, release steps and
   rollback before judging any of them missing.
2. Record the installed Expo SDK and React Native versions from the manifest and lockfile. Several
   checks below depend on the installed SDK. Where a check says "confirm against the installed
   SDK's documentation", read the documentation for that version; do not rely on memory or on
   another project.
3. Record the reviewed revision and whether the working tree was clean.
4. Note which evidence is available: CI logs, build service records, a device, a development
   build. A check that needs a device you do not have is recorded as **blocked**, not passed.

```bash
# Installed SDK and framework versions, read from the manifest (not from memory)
grep -nE '"(expo|react-native|react-native-reanimated|react-native-worklets|expo-updates)"' package.json

# Dependency validation. Run non-interactively and decline any offer to fix.
# Prefer the project's CI log for the same commands; run locally only when that is safe.
CI=1 bunx expo install --check
bunx expo-doctor

# After either command, confirm the audit changed nothing
git status --short
```

`expo install --check` passes when it exits 0 and reports no dependency that differs from the
version the installed SDK expects. `expo-doctor` passes when it exits 0 with every check passing.
Some `expo-doctor` checks need network access; a run that could not reach the network has not
passed, so record it as blocked. If either command offers to modify files, decline; a modified
`package.json` or lockfile after the run means the audit broke its own limits.

---

## 1. App Config

| Check | Criteria                                                                                                                | Verification                                                                                                                                                                                                                                                                                                                                      |
| ----- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[ ]` | The app config is valid and complete: name, slug, URL scheme, iOS bundle identifier and Android package                 | Read the config (for a dynamic config, read the code that builds it, including environment branches). Every field is set for every build variant. The scheme is specific to this app, not a generic word another app could claim                                                                                                                  |
| `[ ]` | The iOS bundle identifier and Android package are reverse-DNS, consistent with each other, and match the store identity | Compare both identifiers with the store listing evidence the project keeps. A mismatch between config and the recorded store identity is a finding. If the project keeps no record of the store identity, report that as the gap; do not sign in to a store to check                                                                              |
| `[ ]` | Orientation is an explicit decision                                                                                     | The orientation field is set on purpose: locked, or deliberately free. A locked value matches the project's spec. An unset field with no recorded decision is a finding                                                                                                                                                                           |
| `[ ]` | The New Architecture setting is an explicit, recorded decision that matches the installed SDK's supported configuration | Find where the setting is made, or confirm the project relies on the SDK default and says so. Which SDK versions default it on, and whether an opt-out is still supported, changes between SDKs: confirm against the installed SDK's documentation. An opt-out, or a setting the SDK no longer supports, needs a written reason in the repository |
| `[ ]` | The app version, iOS build number and Android version code only move forward                                            | Compare the current values with the previous release tag and the changelog. A value lower than or equal to one already released is a finding. When a build service increments them remotely, confirm that from its configuration and record it                                                                                                    |
| `[ ]` | Icons and splash assets exist and the doctor reports no asset problem                                                   | Every asset path in the config resolves to a tracked file. `expo-doctor` reports no asset or config schema problem. Required sizes and formats come from the installed SDK's documentation and the stores' current requirements, not from this file                                                                                               |

## 2. Dependency and Native Module Hygiene

| Check | Criteria                                                                             | Verification                                                                                                                                                                                                                                                                                                                            |
| ----- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[ ]` | Every dependency is at the version the installed SDK expects                         | `expo install --check` exits 0 with nothing reported out of date. A recorded exception (an exclude list in the manifest) names each package and the reason; an unexplained exclusion is a finding                                                                                                                                       |
| `[ ]` | The doctor is clean, and it runs in CI                                               | `expo-doctor` exits 0 with every check passing. Confirm a CI job or the project's qc gate invokes both commands. A command that exists only as something a developer may run by hand is not wired (Phase 0, assertion 2)                                                                                                                |
| `[ ]` | No native module ships without a consumer                                            | For each dependency that carries native code, find an import or a config plugin entry that uses it. A native dependency nothing uses costs binary size and review risk: finding. Run the import search against a module known to be used first, to show the search works                                                                |
| `[ ]` | The animation library and its worklets runtime are a pair the installed SDK supports | Read the installed versions of the animation library and, when it is a separate package in this SDK, its worklets runtime. `expo install --check` must accept both. Whether the worklets runtime is a separate package and which versions pair is version-specific: confirm against the installed SDK's and the library's documentation |
| `[ ]` | Native project directories are a deliberate, documented decision                     | When `android/` or `ios/` is tracked, the repository states why (which native change needs it) and how the directories are regenerated or kept in step with the app config. Tracked native directories with no such statement, or directories that disagree with the app config, are a finding                                          |

## 3. Gates

The toolchain standard is not restated here. It lives in the workspace-root `AGENTS.md`
("TypeScript Repo Standards") and is audited by [TS_STANDARDS.md](./TS_STANDARDS.md). This section
checks only that a mobile app is held to it and that the gates reach mobile code.

| Check | Criteria                                                          | Verification                                                                                                                                                                                                                                                                         |
| ----- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `[ ]` | The app meets the workspace toolchain standard                    | Take the result from a current TS_STANDARDS report for this target, or run that audit. Strict tsconfig, zero `any`, lint at zero warnings and a format check all apply. Record measured counts per gate, never "clean" without a count                                               |
| `[ ]` | The gates cover the mobile source, not only shared packages       | Read the globs each gate uses and confirm the app's screens, components and config files are inside them. A gate that passes because it never looked at the app is a failed instrument                                                                                               |
| `[ ]` | Logic that needs no device runs headless in the project's qc gate | Find the suites for domain logic (state, storage, migrations, document import and export) and confirm the qc gate invokes them. A suite that exists but is not invoked has never run                                                                                                 |
| `[ ]` | No console output on shipped paths                                | A lint rule or a build step removes or forbids console calls in production code; cite it. Then search the app source for console calls outside tests and development-only branches. Prove the search first against a file known to contain one. A hit on a shipped path is a finding |

## 4. Performance, Stated as Numbers

Apply the budget rule from [Evidence Rules](#evidence-rules) to every row. The project's own
performance document or budget file is the source of the numbers; this audit supplies none.

| Check | Criteria                                                                                    | Verification                                                                                                                                                                                                                                                                                             |
| ----- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[ ]` | A startup budget exists and has been measured on a device                                   | The budget states time to the first meaningful frame as a number. A measurement record names the instrument, device model, OS version and build type, and the figure is within budget. A simulator figure, or a budget with no measurement, is a finding                                                 |
| `[ ]` | Each gesture surface has a touch latency budget, measured on a device                       | For every surface driven by continuous touch (drawing, dragging, scrubbing), a budget states the latency and the statistic, for example touch-to-ink p90. The measurement record names the instrument and device. A missing budget for such a surface is a finding                                       |
| `[ ]` | Gesture and animation handlers run off the JavaScript thread, with no per-frame React state | Read each gesture and animation handler. A handler that sets React state on every frame or every move event is a finding. A lint rule or a review fixture must enforce this; cite it. "We are careful" is not enforcement                                                                                |
| `[ ]` | Long or unbounded lists use a list built for them                                           | List every scrolling list whose length depends on data. Each uses a recycling list component (FlashList is a common choice) or records why not. A basic list over dynamic content is flagged for review; it becomes a finding when the project cannot show a measurement on a device at realistic length |
| `[ ]` | Bundle size is recorded per release and bounded                                             | A record holds the JavaScript bundle size for each release, and the bytecode size when Hermes is the engine, with a stated ceiling. Confirm the script that produces the figure measures the production bundle (Phase 0, assertion 3). No record, or no ceiling, is a finding                            |

## 5. Data and State

Storage libraries are named as examples. Apply each row to whatever the target uses.

| Check | Criteria                                                                             | Verification                                                                                                                                                                                                                                                                                                                                                                      |
| ----- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[ ]` | Each store is used for what it is for                                                | The key-value store (for example MMKV) holds small independent values. Structured or queryable data lives in the database (for example `expo-sqlite`). Read every write site. A collection serialized into one key, or a database column holding a serialized document that the app then filters in memory, is a finding                                                          |
| `[ ]` | Database migrations are forward-only, with a recorded baseline that a gate enforces  | A baseline records each shipped migration with a content hash, and a gate fails when a shipped migration's content changes. Read the gate and confirm the qc gate invokes it. Then trace what happens when a shipped migration file is edited: the gate must fail. No baseline, or a baseline nothing checks, is a finding                                                        |
| `[ ]` | A corrupt store falls back to a reseed, and a test proves it                         | Read the open path for each store and find the branch that handles unreadable or corrupt data. It reseeds or resets to a usable state; it does not crash or loop. A test feeds a corrupt store and asserts the fallback. No test is a finding even when the branch exists                                                                                                         |
| `[ ]` | No credential or secret is stored in plain text on the device                        | List every value written to the key-value store and the database, by key and column name. Anything that is a token, password, key or session secret must live in the platform's secure storage (for example `expo-secure-store`) and be read at use time. Run the known-positive control before reporting none found. Report names and locations only; never print a stored value |
| `[ ]` | Any export or import document is schema-versioned and rejects input it cannot handle | The document carries a schema version. The import path rejects a version that is too old, a version that is too new, and corrupt input, each with a handled error. Find a test for all three. A missing case is a finding                                                                                                                                                         |

## 6. Offline Honesty

Skip nothing here because the product "is offline". That claim is what this section tests. An app
that is meant to use the network is audited on the same rows: its network use must be the use it
declares, and its offline and failure states must still be designed.

| Check | Criteria                                                               | Verification                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[ ]` | The full product loop completes with the network off                   | On a device in airplane mode, from a cold start, complete the main loop the spec describes. Record the device, the build and each step. Without a device, record the check as blocked and rely on a recorded run only if the project keeps one for this release                                                                                                                                                                       |
| `[ ]` | A network scan with a positive control shows no undeclared network use | Search the app source for `fetch`, `XMLHttpRequest`, `WebSocket` and the HTTP clients the project depends on. First run the search against a fixture known to contain a `fetch` call and record the match. Then review the dependency list: analytics, crash reporting, remote config and update libraries reach the network from native code that a source search cannot see. Each network user must be declared, or it is a finding |
| `[ ]` | Nothing that polls the network can stop the app from starting offline  | Trace the startup path with no connectivity: update checks, config fetches and analytics start-up. Each must time out or skip without blocking the first screen. Read the settings and the code; a launch that waits on the network is a finding                                                                                                                                                                                      |
| `[ ]` | Offline, loading and failure states are designed                       | For each screen that loads or saves, find the state shown while waiting, when empty and when the operation fails. A screen that shows a blank view, an endless spinner or a raw error is a finding                                                                                                                                                                                                                                    |

## 7. Build Profiles and Signing

Traced only. Read `eas.json`, CI configuration and build records. Do not start a build.

| Check | Criteria                                                                       | Verification                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[ ]` | Build profiles exist for development, internal preview and production          | `eas.json` (or the project's equivalent) defines a development profile that produces a development client, a preview profile for internal distribution, and a production profile for the stores. Profile names are a convention; what each profile produces is the check                                                                                                                                       |
| `[ ]` | No signing material is committed                                               | List tracked file names matching keystores, certificates, provisioning profiles and service keys, and the same for history. Names only; do not open a match. Prove the pattern first by piping known sample names through it. Any match is **Critical**                                                                                                                                                        |
| `[ ]` | No signing material or secret is printed in logs, and a secret scan runs in CI | Find the secret scan in CI and confirm a job invokes it. Read a recent build log for the names of secret variables only, and confirm values are masked. Do not copy a suspected secret into the report; cite the log line by location                                                                                                                                                                          |
| `[ ]` | Release artifacts are signature-verified before upload                         | The release procedure or CI runs `apksigner verify` on the Android artifact and `codesign --verify` on the iOS artifact before upload, and stops on failure. A pass is exit code 0 with no verification error, and the reported signer matching the project's recorded signing identity (compare fingerprints, not keys). Read the recorded output for the last release. No recorded verification is a finding |
| `[ ]` | A clean checkout reproduces the build                                          | The lockfile is committed. The build runs `bun install` with a frozen lockfile and nothing depends on files outside the repository apart from named secrets. Evidence is a build record made from a clean checkout of a tagged commit. The audit does not run the build                                                                                                                                        |

## 8. OTA Updates

Traced only. If the app does not ship over-the-air updates, record that from the dependency list
and the app config, with a falsification record, and check that no update library is present.

| Check | Criteria                                                                                 | Verification                                                                                                                                                                                                                                                                                                                                                                                     |
| ----- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `[ ]` | Each build profile maps to a named update channel                                        | Read the channel for every build profile. Channels are named, and a production build can only receive updates published for production. Two profiles sharing a channel without a stated reason is a finding                                                                                                                                                                                      |
| `[ ]` | Rollback is documented and has been rehearsed                                            | The repository documents the rollback procedure, including the exact command (for example `eas update` with its republish option; confirm the option against the installed CLI's help text, do not run it against a channel). Evidence of a rehearsal is a dated record naming the channel, the update rolled back and the result. A procedure nobody has run is a finding                       |
| `[ ]` | The runtime version policy is explicit, and a native change forces a new runtime version | The app config sets a runtime version or a named policy; the policy names available depend on the installed SDK, so confirm against its documentation. Trace how a change to native code or to a native dependency changes the runtime version. An update whose commit range changes native dependencies or config plugins while the runtime version stays the same is a finding                 |
| `[ ]` | Update timing is a written product decision                                              | The settings that control when the app checks for an update and when it loads one are set on purpose, and a document states the product risk accepted (a user running stale code against a user waiting at launch). Read the setting names from the installed update library's documentation; they have changed between versions. Defaults left in place with no recorded decision are a finding |
| `[ ]` | Updates stay within what the stores permit                                               | Updates carry JavaScript and assets only and do not change the app's purpose or add features the store review did not see. Read the current policy text of each store the app ships to and cite it by title and date read; do not cite a clause number from memory. Review the last updates' change descriptions against that text                                                               |

## 9. Store Submission Readiness

Traced only, from the listing materials and records the project keeps. Do not sign in to a store.

| Check | Criteria                                                                                                    | Verification                                                                                                                                                                                                                                                                                                                   |
| ----- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `[ ]` | Listing materials are complete                                                                              | Screenshots exist at the device sizes each store currently requires (read the store's current requirement; sizes change), with listing copy and a support URL. A privacy policy URL exists whenever any data leaves the device                                                                                                 |
| `[ ]` | Data safety and privacy declarations match what the app does                                                | Compare each declaration with the result of section 6. An app declared as collecting nothing must have a clean network scan with its positive control, and no dependency that collects data natively. A declaration the scan contradicts is **High** or **Critical** by what is collected                                      |
| `[ ]` | The content rating answers match the content                                                                | Read the recorded questionnaire answers against the app's actual content, including user-generated and web content. A recorded answer the content contradicts is a finding                                                                                                                                                     |
| `[ ]` | Releases reach internal testers before production                                                           | The release procedure sends a build to an internal testing track (Play internal testing, TestFlight) for review by the release owner before any production release. Evidence is the record for the last release. A production release with no internal review record is a finding                                              |
| `[ ]` | Store accounts, signing keys and legally or financially binding actions belong to the designated owner only | The repository names the role that owns store accounts and signing keys. Verify from access records the project keeps (build service member list, CI secret scopes) that no other person or automation can submit, sign or accept store agreements. The auditor does not hold or test that access. No named owner is a finding |

## 10. Accessibility

Check on a device or development build where possible, with the platform screen reader on. Code
reading alone can confirm labels exist, not that they make sense in order.

| Check | Criteria                                           | Verification                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[ ]` | Touch targets are at least 44 by 44 points         | Measure each interactive control, including its hit slop. Where a platform's own guideline asks for a larger target, the larger value applies; confirm against the current platform guideline. A smaller target is a finding                                                                                                                                                                                                                                                                                                                                                |
| `[ ]` | Every control has a screen-reader label and a role | Read each pressable for an accessibility label and role, then walk the main loop with the screen reader. An unlabeled control, or a label that only says "button", is a finding                                                                                                                                                                                                                                                                                                                                                                                             |
| `[ ]` | Color is never the only carrier of state           | For each state shown by color (selected, error, disabled, active tool), find the second signal: text, icon or shape                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `[ ]` | Sibling states carry comparable contrast           | Where one piece of text shows one of several states (a verdict, a status), measure the contrast ratio of each state's text against its background and compare them. Each passing AA on its own is not enough: a failure state at 5.3:1 beside a success state at 9.3:1 both pass, and the failure reads as an aside. A grayscale check cannot see this, because it asks whether the state survives without color, not whether the states weigh the same. A state that is the one the user most needs to read and has markedly the lowest ratio of its siblings is a finding |
| `[ ]` | Reduced motion is honored                          | Find where the app reads the system reduced-motion setting and confirm non-essential animation is removed or shortened when it is on. No read of the setting is a finding                                                                                                                                                                                                                                                                                                                                                                                                   |
| `[ ]` | Larger text sizes do not break layouts             | At the largest system text size, walk the main screens. Clipped, overlapping or truncated controls are findings. Text scaling switched off app-wide needs a recorded reason                                                                                                                                                                                                                                                                                                                                                                                                 |
| `[ ]` | Safe-area insets are respected                     | On a device with a notch or cutout and a gesture bar, no control sits under the status area, the cutout or the home indicator. Confirm the screens use the safe-area primitives, then check on the device                                                                                                                                                                                                                                                                                                                                                                   |

## 11. Security

| Check | Criteria                                                                             | Verification                                                                                                                                                                                                                                                                                                |
| ----- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[ ]` | Deep link handlers validate their input                                              | List every route reachable by the URL scheme or a universal link. Each handler validates the path and parameters before acting, and a link cannot trigger a destructive or privileged action without confirmation. Cite the validating line, not the route table                                            |
| `[ ]` | WebView use is justified, and no WebView loads an arbitrary URL                      | Search for WebView components, proving the search first. Each use has a stated reason. The source is a fixed origin or checked against an allowlist; a URL taken from a deep link, a document or user input without that check is a finding. Review any bridge that lets page script call native code       |
| `[ ]` | Any local server is loopback-only                                                    | Search for a server started inside the app or its development tooling. A listener bound to all interfaces on a shipped path is a finding                                                                                                                                                                    |
| `[ ]` | Production builds ship with developer menus and debug flags off                      | Read the production build profile and every environment-conditional flag. The production profile does not produce a development client, and no debug, inspection or test-only switch is reachable in it. The exact flag names depend on the installed SDK and platform; confirm against their documentation |
| `[ ]` | Third-party native dependencies are checked against known advisories at release time | The release procedure runs a dependency advisory check and records the result per release. Read the last record. Run the project's own advisory command when it is read-only. No per-release record is a finding                                                                                            |

## 12. Device Matrix

| Check | Criteria                                                           | Verification                                                                                                                                                                                                                              |
| ----- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[ ]` | The release was verified on real Android hardware                  | A test record names the device model, OS version and build. An emulator-only record is a finding                                                                                                                                          |
| `[ ]` | iOS was verified on a build from the project's build service       | A test record names the device or the tester track, the OS version and the build identifier. A simulator-only record is a finding                                                                                                         |
| `[ ]` | OS minimums are deliberate and recorded                            | The Android minimum SDK version and the iOS deployment target are stated with a reason, and are at or above what the installed SDK supports (confirm against its documentation). Values inherited by default with no record are a finding |
| `[ ]` | Fresh-install permission prompts are tested, and denial is handled | For each permission the app declares, a test record covers a fresh install, the prompt, and the denied path. The denied path leaves the app usable and explains what is unavailable. Read the code for the denied branch; cite it         |

## 13. Release Artifacts

| Check | Criteria                                                                | Verification                                                                                                                                                                                                                                             |
| ----- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[ ]` | Crashes can be symbolicated                                             | Source maps for each release are uploaded to the crash service, or kept with the release, and the upload is recorded. If the project relies on the stores' own crash reporting, that plan is accepted in writing in the repository. Neither is a finding |
| `[ ]` | The changelog and release notes are current, and each release is tagged | The changelog has an entry for the current version, and a tag exists for each released version and points at the commit that was built. A released version with no tag is a finding                                                                      |

---

## BREAK-THE-ASSUMPTION (mandatory)

Per [AUDIT_METHODOLOGY.md](./AUDIT_METHODOLOGY.md) Rules 1-3, falsify the claims a mobile project
most often makes about itself. Each scenario ends in **passed** (the control held) or **blocked**
(it did not: a finding), with the deciding `file:line` or the recorded evidence. A scenario that
could not be run for lack of a device or a record is reported as not run, never as passed.

1. **"The app is offline."** Run the positive control, then the network scan from section 6, then
   list every dependency that can reach the network from native code. Trace a cold start with no
   connectivity through each one.
2. **"Nothing secret is stored in plain text."** Prove the search finds a known token-like key
   name. Then trace every write to the key-value store and the database and classify each value.
3. **"An update only ships JavaScript."** Take the commit range since the runtime version last
   changed. Look for a changed native dependency, a changed config plugin or a native directory
   change. If one exists and the runtime version did not change, the claim is false.
4. **"Production has debugging off."** Read the production profile and each flag that depends on
   the environment. Find the one path where a development setting could carry into production: a
   shared base profile, a default value, a variable that is unset in CI.
5. **"Deep links are validated."** Write a link with an unknown route, an oversized parameter and
   a parameter of the wrong type. Trace each through the handler to the line that rejects it.
6. **"A corrupt store recovers."** Trace an unreadable database file and a malformed key-value
   entry through the open path. Confirm the test that covers each runs in the qc gate.
7. **"The numbers were measured on a device."** Open each performance record. One that names a
   simulator, an emulator, or no device at all does not support the budget.

A report with no outcome for every scenario is incomplete (AUDIT_METHODOLOGY Scoring validity).

---

## Audit Checklist

- [ ] Applicability gate run first; scope folder stated, or whole audit N/A with evidence
- [ ] None of the forbidden actions were taken; sections 7, 8 and 9 are recorded as traced
- [ ] Installed SDK and React Native versions recorded; every version-specific check confirmed against that version's documentation
- [ ] Every instrument has a Phase 0 record; each failed instrument raised a High finding
- [ ] App config, version numbering and New Architecture decision checked (section 1)
- [ ] `expo install --check` and `expo-doctor` results recorded with exit codes, and their CI wiring confirmed (section 2)
- [ ] Gates deferred to the workspace standard, with measured counts and confirmed coverage of mobile code (section 3)
- [ ] Every performance figure has a number, statistic, instrument, device and build type; no simulator figure accepted for startup or touch latency (section 4)
- [ ] Storage use, migration baseline, corrupt-store fallback, secure storage and document versioning checked (section 5)
- [ ] Every absence claim has a recorded known-positive control (sections 3, 5, 6, 7, 11)
- [ ] Build profiles, signing hygiene, signature verification and reproducibility traced (section 7)
- [ ] Channels, rollback rehearsal, runtime version policy, update timing and store policy traced (section 8)
- [ ] Listing materials, declarations, rating, internal review and account ownership traced (section 9)
- [ ] Accessibility, security, device matrix and release artifacts checked (sections 10-13)
- [ ] All seven falsification scenarios have an outcome

## Report Template

This audit defines no scoring rubric, so it does not produce a numeric score. Write the score as
`N/A` and let the severity counts and the findings carry the result. Do not derive a number from
checklist ticks or from a green gate.

The report must carry the sections [AUDIT_METHODOLOGY.md](./AUDIT_METHODOLOGY.md) requires: the
instrument validation table, the methodology validity summary and the falsification records. Every
"not applicable" disposition, including a whole-audit N/A and a section set aside because the app
has no OTA updates or no store release yet, needs a falsification record.

```markdown
# Mobile Application Audit Report - YYYY-MM-DD

## Executive Summary

**Overall Score**: N/A (this audit defines no scoring rubric)
**Verdict**: [Pass / Findings / N/A]
**Critical**: [n] **High**: [n] **Medium**: [n] **Low**: [n]

## Scope and Coverage

- **Applicability evidence**: [manifest path and line naming expo or react-native; app config path]
- **App folder**: [path]
- **Installed versions**: [Expo SDK, React Native, read from manifest and lockfile]
- **Reviewed revision**: [commit hash, and whether the working tree was clean]
- **Evidence available**: [CI logs / build records / device model and OS / development build]
- **Forbidden actions**: none taken

| Section                    | Traced | Executed | Outcome                                       |
| -------------------------- | ------ | -------- | --------------------------------------------- |
| 1. App config              | [y/n]  | [y/n]    | [verified / findings / blocked / N/A and why] |
| 7. Build profiles, signing | [y/n]  | no       | [traced only]                                 |
| 8. OTA updates             | [y/n]  | no       | [traced only]                                 |
| 9. Store readiness         | [y/n]  | no       | [traced only]                                 |
| ...                        | ...    | ...      | ...                                           |

## Instrument Validation (Phase 0)

[Table and summary from AUDIT_METHODOLOGY.md, one row per command, script, profiler or search]

## Measurements

| Budget            | Stated value | Measured | Statistic | Instrument | Device and OS | Build type | Within budget |
| ----------------- | ------------ | -------- | --------- | ---------- | ------------- | ---------- | ------------- |
| [startup / touch] | [n unit]     | [n unit] | [p90]     | [name]     | [model, OS]   | [dev/rel]  | [yes/no]      |

## Absence Claims

| Claim                   | Known-positive control (what matched) | Search run on target | Result |
| ----------------------- | ------------------------------------- | -------------------- | ------ |
| [no undeclared network] | [fixture path and matched line]       | [command]            | [hits] |

## Version-Specific Confirmations

| Check | Installed version | Documentation read (title, date) | Result |
| ----- | ----------------- | -------------------------------- | ------ |

## Methodology Validity

[Summary and falsification records from AUDIT_METHODOLOGY.md, including scenarios 1-7]

## Findings

| Severity | Section | Finding | Evidence (file:line or record) | Remediation |
| -------- | ------- | ------- | ------------------------------ | ----------- |

---

**Auditor**: [Name]
**Date**: [Date]
**Next Review**: [before the next store release]
```

## Deliverables

- The report at `.aidd/audit-reports/MOBILE-YYYY-MM-DD.md`, following the template above.
- The applicability evidence, or the whole-audit N/A with its falsification record.
- The instrument validation table, methodology validity summary and falsification records
  required by [AUDIT_METHODOLOGY.md](./AUDIT_METHODOLOGY.md).
- The measurements table and the absence-claims table, each row carrying its instrument or its
  known-positive control.
- A `feature.json` under `.aidd/features/` for each confirmed finding that needs a change,
  following the schema and severity mapping in
  [SEVERITY_CLASSIFICATION.md](./SEVERITY_CLASSIFICATION.md):
    - Directory and `id`: `audit-mobile-{unix_timestamp}-{descriptive-slug}` (the `id` MUST match
      the directory name exactly).
    - `auditSource`: `"MOBILE"`, `category`: `"Audit"`, `passes`: `false`, `status`: `"backlog"`.
    - `priority` / `auditSeverity` per the Critical=1 / High=2 / Medium=3 / Low=4 mapping.
    - `description` carries the evidence: the `file:line` or the named record, and for a
      measurement the instrument, device and figure. Never include a secret value.
    - `spec` contains actionable remediation steps.

Severity guidance: committed signing material, a secret stored in plain text or printed in a log,
and a WebView or deep link that lets outside input run privileged actions are **Critical**. An
update that carries native changes under an unchanged runtime version, a store declaration the app
contradicts, a debug surface reachable in production, a failed or missing instrument, and a
missing rollback rehearsal are **High**. A missing budget, an unrecorded decision, an unused
native dependency and accessibility failures on secondary screens are **Medium** unless their
effect on users raises them. Record housekeeping gaps as **Low**.

## Success Criteria

The audit succeeds when its report is supported by evidence, whether or not the target has
defects. The report must:

- State the applicability evidence, the app folder, the installed versions and the reviewed revision
- Show that no build, submission, update, signing action or secret read took place, and mark the build, update and store sections as traced
- Give every performance figure a number, statistic, instrument, device and build type, and accept no simulator figure for startup or touch latency
- Back every absence claim with a recorded known-positive control
- Name the documentation read for each version-specific check, against the installed version
- Report each check that could not be run as blocked, with the reason, instead of passing it
- Carry no numeric score, and satisfy the methodology gate
