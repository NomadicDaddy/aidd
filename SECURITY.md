# Security Policy

aidd is a local-first tool: it runs on your machine, against your projects, with the backend
providers and credentials you configure. Even so, we take security issues seriously and
appreciate responsible disclosure.

For a full inventory of what aidd reads, writes, runs, and sends over the network (including the
`.aidd/` write allowlist, recipe shell steps, and backend network egress), see
[What aidd Can Modify](docs/guides/what-aidd-modifies.md).

## Supported versions

We make security fixes against the latest released version. Please reproduce issues on the
most recent release before reporting.

## Reporting a vulnerability

**Please do not open a public issue for a security vulnerability.**

Use GitHub's private vulnerability reporting (**Security → Report a vulnerability** on the
repository) to open a confidential advisory. Include:

- a description of the issue and its impact,
- steps to reproduce or a proof of concept,
- affected version(s) and platform,
- any suggested remediation.

We aim to acknowledge a report within a few days and to keep you updated as we investigate and
prepare a fix. We will credit reporters in the release notes unless you prefer to remain
anonymous.

## Scope and good-faith guidance

aidd executes AI agent workflows that can read and modify the projects you point it at, run
shell steps in recipes, and (when you opt in) bind the web panel to your LAN. When assessing
security, keep in mind:

- The web panel binds to `127.0.0.1` by default. Remote binding is opt-in and should be paired
  with `web.authToken`; see [docs/guides/deployment.md](docs/guides/deployment.md).
- Provider API keys and channel tokens live in `~/.aidd/config.json` and are never exposed
  through the web settings surface.
- Recipes can run shell steps and agents can modify files; treat the projects and recipes you
  run as trusted input.

Reports that require already-untrusted local access (for example, an attacker who can already
read `~/.aidd/config.json`) are generally out of scope, but we still welcome a heads-up.
