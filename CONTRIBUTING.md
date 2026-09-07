# Contributing to aidd

Thanks for your interest in aidd. A few honest notes on how this project is run.

## Project posture

aidd is maintained by a single author as time allows. **Bug reports, questions, and
discussion are genuinely welcome.** Pull requests are _considered but not solicited_: an
unsolicited PR may be declined, or may sit for a while. If you want to change something
non-trivial, **open an issue first** so we can agree on the approach before you invest effort.

## Reporting bugs and ideas

- Search existing issues first.
- For bugs: include your OS, Bun version, what you did, what you expected, and what actually
  happened (logs/output help).
- For features: describe the problem you're trying to solve, not just the solution you have in
  mind.

## Security

Please do **not** open public issues for security problems. See [SECURITY.md](SECURITY.md) for
how to report privately.

## Development

aidd is a Bun + TypeScript monorepo (`shared`, `backend`, `frontend`, `cli`), Windows-first and
local-first.

- Install [Bun](https://bun.sh) (see `package.json` `engines` for the version).
- `bun install`
- Run the gates before proposing a change: `bun test`, `bun run typecheck`, `bun run lint`, and
  `bun run smoke:qc`.

See `README.md` and `docs/` for architecture and workflow detail. Maintainers cutting a release
should follow [docs/architecture/releasing.md](docs/architecture/releasing.md) (checklist + rollback plan).

## License of contributions

aidd is licensed under the **Functional Source License 1.1 (Apache 2.0 future license)**; see
[LICENSE](LICENSE). By submitting a contribution you agree that it is provided under that same
license and that you have the right to submit it. There is no separate CLA.
