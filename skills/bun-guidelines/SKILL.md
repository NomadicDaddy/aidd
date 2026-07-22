---
name: bun-guidelines
description: 'Bun (1.3.x) best practices for the package manager, text lockfile, direct TypeScript execution, Bun.serve routing, bun test, bundler, single-file executables, built-in APIs, Node.js compatibility, and Docker packaging. Use when writing, reviewing, or configuring Bun-based tooling or services.'
metadata:
    aidd-category: general
---

# Bun Guidelines

> **Version**: Target Bun **1.3.x** with a **1.3.14** workspace baseline. Pin the major with
> `oven/bun:1` in containers; pin exact versions in CI.
> **Install**: `curl -fsSL https://bun.sh/install | bash` (macOS/Linux) or `pwsh -c "irm bun.sh/install.ps1 | iex"` (Windows).
>
> Bun is a JavaScript/TypeScript runtime, package manager, bundler, and test runner in one binary. This guide covers the practices that matter when Bun is the toolchain: package management, direct TS execution, the built-in server/test runner, and container packaging.

## Core Principles

1. Use one tool for the whole lifecycle (install, run, test, and build) instead of stitching together npm + tsx + jest + esbuild.
2. Run TypeScript and JSX directly. Do not add a separate transpile step for scripts and services.
3. Commit the text lockfile (`bun.lock`) and install with `--frozen-lockfile` in CI for reproducible builds.
4. Prefer Bun's built-in APIs (`Bun.serve`, `Bun.file`, `bun:sqlite`, `Bun.password`, `Bun.$`) over third-party equivalents when they fit.
5. Validate Node.js compatibility for native-addon-heavy, clustering, or advanced process-management workloads before adopting Bun for them.

## Package Management

Bun's package manager is a drop-in for npm/yarn/pnpm and is dramatically faster.

### Commands

```bash
bun install                 # Install all deps; writes/updates bun.lock
bun add hono                # Add a dependency
bun add -d @types/node      # Add a devDependency (--dev). Also --optional, --peer, -E/--exact
bun remove hono             # Uninstall
bun update [pkg]            # Upgrade within semver ranges (--latest to jump ranges)
bun outdated                # List outdated packages
bun pm ls                   # Inspect the installed tree (also: bun pm cache, bun pm bin, bun pm trust)
```

### Lockfile

- The default lockfile is the **text-based `bun.lock`** (JSONC with comments allowed and reviewable in diffs), the default since **Bun 1.2**. The legacy binary `bun.lockb` still works but is not the default.
- **Commit `bun.lock`.** In CI, install with `--frozen-lockfile` (aliased as `bun ci`): it installs exactly what the lockfile specifies and **fails the build if `package.json` and the lockfile are out of sync**.
- `bun install` auto-migrates from `package-lock.json` / `yarn.lock` / `pnpm-lock.yaml` when no `bun.lock` exists. To convert an existing binary lockfile: `bun install --save-text-lockfile --frozen-lockfile --lockfile-only`, then delete `bun.lockb`.

### Production installs

```bash
bun install --production     # or --omit dev; skip devDependencies for a lean runtime image
```

### Monorepos

- Declare `"workspaces"` in the root `package.json`. Scope installs/scripts with `bun install --filter <pattern>`.
- Use **package catalogs** (Bun 1.3+) to centralize shared dependency versions across workspace packages.

### Patching dependencies

```bash
bun patch <pkg>              # Prepare a package in node_modules for editing
# ...edit the files...
bun patch --commit node_modules/<pkg>   # Writes patches/<pkg>.patch and wires up "patchedDependencies"
```

### Supply-chain hygiene

- Lifecycle (post-install) scripts run **only for packages listed in `trustedDependencies`**. This is an intentional guard against malicious install scripts. Add packages there deliberately.
- `--minimum-release-age` ignores versions published too recently, mitigating a class of hijacked-release attacks.

## Running Code

```bash
bun index.ts                # Run TS/JSX directly; no transpile step
bun run build               # Run a package.json script
bun --watch test            # Hard restart on change (clean state); good for tests/CLIs
bun --hot server.ts         # Soft hot reload; preserves global state and keeps servers alive
```

- `--watch` does a **hard restart**: it relaunches the process with the same args/env (fresh state).
- `--hot` does a **soft reload**: it swaps modules in place, preserving `globalThis` and live connections. Prefer it for stateful servers.
- Both use native filesystem events, not polling.

### Environment variables

- Bun auto-loads `.env`. Precedence (low → high): `.env` → `.env.{production|development|test}` (selected by `NODE_ENV`) → `.env.local`.
- Access via `process.env`, `Bun.env`, or `import.meta.env` (all aliases).
- **To disable `.env` autoload** (for example, when a project uses explicit JSON config following the Spernakit pattern in `12-factor-guidelines`), set `env = false` in `bunfig.toml`. Files passed with `--env-file` still load.

### `bunfig.toml`

Key sections: `[install]` (`registry`, `linker`, `frozenLockfile`, `production`, `cache`), `[test]` (coverage, preload), `[run]`, and top-level `telemetry` and `env`.

## HTTP Server (`Bun.serve`)

`Bun.serve()` supports a `routes` object with static paths, parameterized routes (`/users/:id`), per-method handlers, and wildcard catch-alls. Handlers receive a `BunRequest` (extends the standard `Request`) and return a `Response`.

```ts
Bun.serve({
	port: 3000,
	routes: {
		'/': new Response('Home'),
		'/users/:id': (req) => Response.json({ id: req.params.id }),
		'/api/posts': {
			GET: () => Response.json([]),
			POST: async (req) => Response.json(await req.json()),
		},
		'/*': () => new Response('Not found', { status: 404 }),
	},
	fetch(req) {
		return new Response('fallback'); // optional catch-all
	},
});
```

- Built-in cookie support (Bun 1.3+) via a Map-like `request.cookies` API that auto-emits `Set-Cookie`.
- Bind the port from config, not a literal, to stay 12-factor compliant (see `12-factor-guidelines`).

## Testing (`bun test`)

`bun test` is a fast, built-in, Jest-compatible runner. Import from `bun:test`.

```ts
import { describe, expect, mock, spyOn, test } from 'bun:test';

test('adds numbers', () => {
	expect(1 + 2).toBe(3);
});
```

- **Matchers**: Jest-compatible `expect`.
- **Mocking**: `mock()` for mock functions, `spyOn()` for spies, `mock.module()` for module mocking.
- **Coverage**: `--coverage` (configurable under `[test]` in `bunfig.toml`).
- **Snapshots**: `toMatchSnapshot()` and inline snapshots.
- **Useful flags**: `--watch`, `--timeout` (default 5000ms), `--bail`, `--rerun-each`, `--randomize`/`--seed`, and `--concurrent` for parallel tests. Recent 1.3.x releases added sharding/isolation flags (`--shard`, `--isolate`, `--changed`). Confirm the exact flag names against `bun test --help` for your installed version.

## Bundling &amp; Executables

```bash
bun build ./entry.ts --outdir ./dist --target browser   # Bundle (targets: browser | bun | node)
bun build ./cli.ts --compile --minify --sourcemap --outfile mycli   # Single-file executable
bun build ./cli.ts --compile --target=bun-linux-arm64 --outfile mycli   # Cross-compile
```

- `--compile` bundles your code **plus the Bun runtime** into a standalone executable. Cross-compile with `--target=bun-{linux,windows,darwin}-{x64,arm64}`.
- `--bytecode` moves parse cost to build time (~2x faster startup); `--define KEY=value` sets build-time constants with dead-code elimination.
- `--compile` does not support `--outdir`, `--target=node`, or `--no-bundle`.

## Built-in APIs Worth Knowing

| API            | Purpose                                                                                       |
| -------------- | --------------------------------------------------------------------------------------------- |
| `Bun.serve()`  | HTTP/WebSocket server with routing (see above)                                                |
| `Bun.file(p)`  | Lazy, Blob-like file handle: `.text()`, `.json()`, `.arrayBuffer()`, `.stream()`              |
| `Bun.write()`  | Fast writes (file paths, `Response`, `Blob`, strings)                                         |
| `Bun.$`        | Cross-platform shell scripting in JS/TS with auto-escaping (injection-safe), pipes, redirects |
| `bun:sqlite`   | Built-in native SQLite driver (`import { Database } from 'bun:sqlite'`)                       |
| `Bun.password` | `Bun.password.hash()` / `.verify()`: argon2id (default) or bcrypt                             |
| `Bun.env`      | Alias of `process.env`                                                                        |

Bun 1.2/1.3 also added a unified SQL API with built-in Postgres/MySQL and Redis clients, and `Bun.cron()` for in-process scheduling. Prefer these built-ins over external packages when they cover the need.

## Node.js Compatibility

Bun is broadly production-ready. Next.js, Express, and millions of npm packages run on it, and the Node.js test suite runs before releases. Core modules (`node:fs`, `node:http`, `node:stream`, `node:path`, most of `node:crypto`) are fully implemented. Validate these known gaps before adopting:

- `node:cluster`, `node:http2`, `node:worker_threads`, `node:test`: **partial**. Cluster cannot pass handles/FDs between workers, so cross-process HTTP load-balancing is Linux-only.
- `node:repl` and `node:sqlite`: not implemented (use Bun's native REPL and `bun:sqlite`).
- `process.binding` and `module.register`: unavailable; a few packages that rely on them break.

## Docker

Use the official `oven/bun` image. Pin the major with `oven/bun:1` for production; distro variants include `-slim`, `-alpine`, `-debian`, and `-distroless`. Prefer a multi-stage build that separates dev and production dependency installs and runs as the non-root `bun` user. See `docker-guidelines` for general container practices.

```dockerfile
FROM oven/bun:1 AS base
WORKDIR /usr/src/app

# Install dev + prod deps in separate layers for caching
FROM base AS install
RUN mkdir -p /temp/dev
COPY package.json bun.lock /temp/dev/
RUN cd /temp/dev && bun install --frozen-lockfile
RUN mkdir -p /temp/prod
COPY package.json bun.lock /temp/prod/
RUN cd /temp/prod && bun install --frozen-lockfile --production

# Build/test against dev deps
FROM base AS prerelease
COPY --from=install /temp/dev/node_modules node_modules
COPY . .
ENV NODE_ENV=production
RUN bun test
RUN bun run build

# Minimal runtime image: prod deps only, non-root user
FROM base AS release
COPY --from=install /temp/prod/node_modules node_modules
COPY --from=prerelease /usr/src/app/. .
USER bun
EXPOSE 3000/tcp
ENTRYPOINT ["bun", "run", "index.ts"]
```

## Windows Support

Native Windows (x64) support is GA and mature. The full toolchain (runtime, install, test, and bundler) runs natively. Native Windows ARM64 shipped in 1.3.10 with official binaries and `--target=bun-windows-arm64` cross-compilation. Use a recent installer to avoid older ARM64 mis-resolution issues.

> **Note on this stack**: Where a project's backend is PowerShell/Pode (see `pode-guidelines` and `powershell-guidelines`), Bun is typically the tooling layer for linting, formatting, test orchestration (`bun run smoke:qc`), and asset builds rather than the service runtime. Keep that boundary clear.

## References

Official sources behind this guide:

- Bun documentation: <https://bun.com/docs>
- Package manager &amp; lockfile: <https://bun.com/docs/cli/install> · <https://bun.com/docs/pm/lockfile>
- Runtime, hot reload &amp; env: <https://bun.com/docs/runtime/hot> · <https://bun.com/docs/runtime/env>
- HTTP server &amp; routing: <https://bun.com/reference/bun/serve> · <https://bun.com/docs/runtime/http/routing>
- Test runner: <https://bun.com/docs/cli/test>
- Bundler &amp; executables: <https://bun.com/docs/bundler/executables>
- Node.js compatibility: <https://bun.com/docs/runtime/nodejs-apis>
- Docker guide (official): <https://bun.com/guides/ecosystem/docker>
- Releases &amp; version tracker: <https://github.com/oven-sh/bun/releases> · <https://endoflife.date/bun>
- Related skill: `docker-guidelines`
