# Licensing

aidd is Fair Source under the
[Functional Source License 1.1 (ALv2 future license)](../../LICENSE) (`FSL-1.1-ALv2`). The source
is public, and the license permits use, modification, and redistribution subject to its terms. The
principal restriction is that you may not make aidd available to others as a competing commercial
product or service during the two-year Fair Source period.

Each release converts to Apache-2.0 on the second anniversary of the date that release is made
available. The root [LICENSE](../../LICENSE) file states that term relative to each release rather
than as a calendar date.

## What is included

Every shipped aidd capability is included under the same license:

- supervised and unattended runs;
- scheduled recipes, skills, audits, and Director cycles;
- bounded Director suggestion auto-launch;
- automatic continuation through `autoChainRuns`;
- every backend, audit, recipe, skill, and pipeline surface;
- the web panel, MCP server, Telegram bridge, and local APIs;
- Triumvirate mode, worktrees, approvals, telemetry, and run history.

Automatic work remains opt-in and bounded by its operational settings. It is included under the
same license as supervised work.

## Internal and commercial use

The FSL permits using aidd inside an individual or organization, including to build and operate
commercial products. The competing-use restriction concerns offering aidd itself as a competing
commercial product or service. Read the license text for the controlling terms; this guide is a
plain-language product summary, not a substitute for legal advice.

## Third-party material

aidd is distributed as source, so its npm dependencies do not travel with it; they keep their own
licenses regardless. Material vendored into the repository is the exception, and it carries its own
licenses and notices. `bun run check:licenses` verifies that inventory as a `smoke:qc` step,
independently of aidd's FSL terms. See
[THIRD-PARTY-LICENSES.md](../../THIRD-PARTY-LICENSES.md),
[THIRD-PARTY-NOTICES.md](../../THIRD-PARTY-NOTICES.md), and
[licenses/distributed-materials.json](../../licenses/distributed-materials.json).

For security reports, support, and privacy behavior, see [SECURITY.md](../../SECURITY.md),
[SUPPORT.md](../../SUPPORT.md), and [PRIVACY.md](../../PRIVACY.md).
