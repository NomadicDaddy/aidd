# Sweeping an Electron application

Read this when the target is a desktop Electron app rather than a URL (`--runtime electron`). The
web workflow in SKILL.md still applies phase by phase. This file replaces the parts that assume a
browser: how the target is reached, how its size is set, what a surface is, and how instances are
isolated and cleaned up.

Proven 2026-09-29 against the built Summon Team Window (Electron 44.5.0): two isolated instances,
eight captures at the four desktop sizes, through the real main, preload and renderer. The proof
was one surface, not a full native sweep. Evidence:
`D:\applications\summon-team-window-draft\electron-design-sweep-adapter-proof-20260929.md`.

## Runtime and run identity

- The runtime is separate from the viewport mode. A run is `{runtime, mode}`, and an Electron
  desktop run never shares a work directory, screenshot directory or report index with a web
  desktop run. Put the runtime in the run id and every path the run writes.
- A web preview of the same renderer is not native evidence and cannot stand in for it. An
  isolated synthetic-data review cannot claim that live provider workflows passed.

## Phase 0 additions: prove the adapter

- Identify the entry point and the build: the package, the main script, and the executable that
  actually runs. Record the executable's own reported version (`process.versions.electron` from the
  running binary), not the version in `package.json`. The 2026-09-29 proof found package 44.5.0
  against a local binary of 44.4.5.
- Launch the real main, preload and renderer with a synthetic data root, a separate Electron
  `userData` directory, and separate ports and instance locks for each reviewer. Never attach to
  or restart the operator's own window. If the app cannot be isolated safely, review serially or
  mark the sweep blocked. Never disable its security settings or fake its bridge to make a capture
  succeed.
- Within 60 seconds, prove a non-blank capture AND that the production preload/IPC bridge answers.
  A running process or a completed navigation proves neither. Fail closed without a real rendered
  capture.
- The first capture of a hidden window can fail (`UnknownVizError` in the proof). Allow one bounded
  retry, about 400ms after a rescan, and record that it happened.

## Sizing: content, not window

- Set the size with `BrowserWindow.setContentSize`, then assert the renderer's `innerWidth` and
  `innerHeight`. An outer `setSize` is not a CSS viewport and must never be treated as one.
- Record content bounds, outer bounds, zoom, device pixel ratio, host display scale and the PNG's
  actual pixel size for every capture.
- Host scaling can round an exact size. At 150% the 1309px height came out wrong, and a recorded
  1x override gave exact dimensions. Record any controlled scale or achieved-size deviation, and
  keep it identical across every reviewer in the run.
- A mode viewport below the app's native minimum window size is unreachable. Record it as such or
  as an explicit override. Never let it clamp silently.

## Surfaces

- A surface is `{runtime, window, routeOrPane, reach}`, not a URL. Enumerate menus, tabs, panes,
  task dialogs and additional BrowserWindows from the real source and UI.
- Renderer `capturePage` cannot see OS chrome or native dialogs. Cover those with their own
  instrument and report them as a separate coverage line, never as captured.

## Fan-out

- Give each surface reviewer its own fixture instance. If the app cannot run more than one
  instance, a bounded serial review is more honest than several agents driving one window.
- Keep the existing single-writer consolidation and evidence schema.

## Secrets and security

- Run the secret checks from SKILL.md on every renderer, input value, URL and embedded terminal
  before each capture. Use synthetic app data from the start; never copy a real profile, mailbox or
  credential store. Never unmask a field.
- Production `contextIsolation`, `sandbox`, `nodeIntegration` and native permissions stay exactly
  as shipped.

## Evidence and cleanup

- Record main and renderer errors, GPU and capture flags, window visibility, actual motion, and
  version and hash provenance.
- Clean up by the instance PIDs you launched and their descendants, and preserve any window that
  existed before the run. Never kill by process name. Keep failed-probe evidence. Before claiming
  nothing was left running, show that the leftover check can see a process you know exists.
