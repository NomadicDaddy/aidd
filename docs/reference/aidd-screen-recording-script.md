# aidd walkthrough recording runbook

Formerly kept with the maintainer's private launch notes, under the same file name.

Source-checked October 14, 2026 against aidd main at `b3c2e44d`, not a tagged-release
rehearsal. Retain until an accepted walkthrough exists or Phillip cancels the deliverable.
No provider was launched and no recording was made for this review. Select and record the
published tag before capture, checking it with `gh release list`; do not treat newer main
controls as capabilities of an older release. A rehearsal against the selected tag is still owed.

Record a tagged source release, disposable managed project, real pipeline, and its report as
separate segments; edit out the waiting time.

## Deliverables

- `aidd-walkthrough-master.webm`: the edited browser-quality master.
- `aidd-walkthrough.mp4`: the full walkthrough for the release page.
- `aidd-walkthrough-teaser.gif`: a short README excerpt, not the entire walkthrough.

Keep capture output outside every Git repository until the final files have been approved.

## Safety contract

`codebase-analysis` is source-code read-only, but it is not filesystem read-only. It writes an
analysis report under `.aidd/audit-reports/`, updates `.aidd/CHANGELOG.md`, and may create
remediation feature records only when explicitly requested; the standard recipe does not request
backlog output. A dry run also creates aidd run and pipeline history.

- Use a fresh disposable copy of an already aidd-managed project. It must contain `.aidd/` before
  the take starts.
- Never point this runbook at a working checkout containing valuable staged, unstaged, ignored, or
  untracked work.
- Authenticate the selected backend off-camera. Do not type or expose API keys, access tokens, or
  passwords during the recording.
- Use a neutral demo path and project name. Do not expose a Windows username, private repository
  name, absolute path, token, or unrelated browser content.
- Do not fake a run status, result, report, or terminal command. Use editing only to remove waiting
  time and join authentic segments.
- Record the release and publication dates, capture date, backend, model, and dimensions in the
  capture notes. Every visible capability must belong to that release, or the page must identify
  the recording as later; cropping or editing a later label does not make it contemporaneous.

The public-project allowlist is: **aidd, spernakit, htmx-debugger, podex, AgentWatch, starsync,
keystrike**. Any project name visible on camera must be one of these or the neutral demo name.
Redact or reframe every other project name, all absolute paths, tokens, private feature titles, and
unrelated fleet data. This is the same allowlist the image capture runbook uses, and it tracks the
public project list on beazley.org. Recheck that list before capture.

## Resolve the inputs

Use a dedicated recording OS user profile or disposable VM with its own backend authentication.
aidd reads `~/.aidd/config.json`: a disposable source directory alone does not isolate settings,
credentials, fleet roots, or the port. Use that same recording profile for every controller,
launch, and cleanup terminal; do not edit the owner’s normal user config.

Set these values in a PowerShell 7 controller terminal:

```powershell
$releaseDir = '<absolute path to the extracted tagged source release>'
$demoProject = '<absolute path to a disposable aidd-managed project copy>'
$captureDir = '<absolute output directory outside a Git repository>'
$panelUrl = 'http://127.0.0.1:3291'
$browserSession = 'aidd-walkthrough'
```

Fail closed if the release, project metadata, or output boundary is wrong:

```powershell
if (-not (Test-Path -LiteralPath "$releaseDir\package.json") -or
    -not (Test-Path -LiteralPath "$releaseDir\VERSION")) {
    throw 'The extracted aidd source release is incomplete.'
}
if (-not (Test-Path -LiteralPath "$demoProject\.aidd")) {
    throw 'The demo project is not aidd-managed. Prepare a disposable managed copy first.'
}
New-Item -ItemType Directory -Force -Path $captureDir | Out-Null
git -C $demoProject status --short
```

Stop if the displayed Git state is not expected for the disposable fixture. Do not use `git stash`
or reset a real checkout to prepare it.

Off-camera, configure the recording profile's `~/.aidd/config.json` for `web.port: 3291`,
`web.hostname: '127.0.0.1'`, `web.allowRemote: false`, and only the disposable parent directory in
`web.allowedRoots`. Keep `web.dataDir` unset so local databases stay in the release's `data/`.
Verify these settings against the selected release. Startup normally invokes `stop:web` first,
so a spare directory with the owner's configuration can stop the owner's panel.

Before every launch, confirm another process does not own the configured recording port:

```powershell
$existingListener = Get-NetTCPConnection -LocalPort 3291 -State Listen -ErrorAction SilentlyContinue
if ($existingListener) {
    throw 'Port 3291 is already in use. Identify the listener; do not kill an unknown process.'
}
```

## Prepare the release state off-camera

The source release writes its panel database, managed skills, logs, and run artifacts beneath
its source directory. Use a disposable release directory or a deliberately prepared recording
copy; do not clear an existing installation's `data/`.

Before recording:

1. Confirm the chosen backend is already authenticated.
2. Confirm the backend and model belong to the exact release and publication date; do not inherit
   a newer machine-wide default without checking it.
3. Confirm the demo project can complete the `codebase-analysis` recipe.
4. Perform the dry run against a separate disposable copy, not the copy reserved for the take.
5. Recreate the take copy from the clean fixture after the dry run.
6. Close unrelated applications and notifications.
7. Use dark mode, 100% browser zoom, and the workspace default 2250×1309 viewport.

## Segment 0: launch the source release

Use an isolated terminal and FFmpeg `gdigrab` for this segment. Crop to the neutrally titled
window and keep paths out of frame.

Install dependencies off-camera with `bun install`. From the extracted release directory, show
this real command:

```powershell
Set-Location -LiteralPath $releaseDir
bun run start:web
```

Hold long enough to show the panel URL, then end the terminal segment. Caption it in post:
**“No installer. Run the tagged source release.”**

From the controller terminal, start this eight-second FFmpeg capture immediately before executing
the launch command in a terminal titled `aidd Walkthrough Terminal`:

```powershell
ffmpeg -y -f gdigrab -framerate 30 -i 'title=aidd Walkthrough Terminal' -t 8 `
    "$captureDir\00-launch.mkv"
```

Verify the panel before browser capture:

```powershell
$panelResponse = Invoke-WebRequest -Uri $panelUrl -UseBasicParsing
if ($panelResponse.StatusCode -ne 200) {
    throw "aidd panel returned HTTP $($panelResponse.StatusCode)."
}
```

## Browser recording invariants

Use the installed `agent-browser` with a named session. Discover controls from a fresh snapshot;
never save element references in this document. References such as `@e7` become invalid after
navigation, form submission, modal changes, and dynamic list updates.

```powershell
agent-browser --session $browserSession --color-scheme dark open $panelUrl
agent-browser --session $browserSession set viewport 2250 1309
agent-browser --session $browserSession set media dark
agent-browser --session $browserSession snapshot -i
```

For every segment:

1. Navigate and rehearse off-record.
2. Take a fresh interactive snapshot.
3. Start or restart recording to a new WebM file.
4. Refresh the snapshot if the page changed. The installed recorder captures the active page
   without replacing its context; confirm this with `agent-browser record --help` before a take.
5. Use semantic labels or the new references to interact.
6. Pause for 500–1,000 ms after meaningful changes.
7. Stop recording immediately after the segment's final hold.
8. Check browser console errors and visually inspect the segment before continuing.

Use this command pattern around each browser segment, replacing the filename:

```powershell
$segmentPath = Join-Path $captureDir '01-configure.webm'
agent-browser --session $browserSession record start $segmentPath
agent-browser --session $browserSession snapshot -i
# Perform the segment actions with fresh references.
agent-browser --session $browserSession record stop
agent-browser --session $browserSession console
agent-browser --session $browserSession errors
```

## Segment 1: dashboard and configuration (`01-configure.webm`)

1. Start on `/` and hold on the Dashboard. Caption: **“Local control panel, localhost only.”**
2. Open **Settings**.
3. In **Workspace**, add the parent directory of the disposable demo project to **Application
   Roots**.
4. Open **Run Engine** and show only verified release-era backend/model defaults. Do not open
   provider credentials or token dialogs.
5. Select **Save** (or the selected release's equivalent) and wait for confirmation.

This take uses Workspace and Run Engine. The current source also has AI & Director, Integrations,
and Control Panel; verify the chosen release rather than assuming these are its only sections.

## Segment 2: discover and inspect the project (`02-project.webm`)

1. Open **Projects**.
2. If the disposable project is not visible, use the page's refresh control once.
3. Stop if it still does not appear. Do not improvise an ingest flow during the take; the fixture
   was prepared incorrectly.
4. Open the project and hold on **Overview** so maturity and feature information are visible.
5. Briefly open **Features**, then return to the main navigation.

Caption: **“Projects are discovered from configured roots.”**

Project Detail has no Recipes tab. Recipes is a top-level navigation destination.

## Segment 3: launch the analysis (`03-launch.webm`)

1. Open **Recipes** from the main navigation.
2. Select the disposable project in the **Project** field.
3. Search for `codebase-analysis`.
4. Open its launch controls and select **Start Session**.
5. Confirm the application redirects to `/runs?pipeline=<session-id>` with the new pipeline
   selected.
6. Hold on the queued/running status and live console.

Caption: **“Launch a source-read-only analysis.”** Do not call it non-mutating.

Stop this recording while the run works. Do not record minutes of waiting and do not assume a
fixed completion time. Check progress periodically with fresh snapshots and keep the operator
updated during a long run.

## Segment 4: inspect the real result

Start `04-result.webm` only after the selected pipeline reaches a terminal status.

1. Show the completed pipeline in the Runs feed.
2. Select **Full report**.
3. Hold on the pipeline summary: status, project, duration, progress, and execution intent.
4. Expand the executed step and show its real output summary, including the analysis-report path
   when the agent produced one.

Caption: **“Review the pipeline result and recorded output.”**

If the pipeline failed, keep the authentic failure for diagnosis and make a new take after fixing
the fixture. Never edit the displayed status or substitute a prior result.

## Segment 5: end card

Create a three-second card containing:

```text
nomadicdaddy.github.io/aidd
Local control panel for AI coding work
```

Add the end card in post-production, outside the live application DOM.

## Edit and export

Join the terminal clip, four browser segments, and end card. Remove setup pauses and the long run
wait. Add captions in post rather than injecting them into the application.

Check dimensions with FFprobe and re-record sources narrower than 1440px. Keep the recorded
resolution through editing and apply the Lanczos scale once; repeated resizing softens UI text.

Export the full MP4 from the edited master:

```powershell
ffmpeg -y -i "$captureDir\aidd-walkthrough-master.webm" `
    -vf 'fps=30,scale=1440:-2:flags=lanczos' `
    -c:v libx264 -crf 20 -preset slow -pix_fmt yuv420p -movflags +faststart `
    "$captureDir\aidd-walkthrough.mp4"
```

Create a 10–20 second teaser from the strongest browser section rather than converting the full
walkthrough to GIF:

```powershell
$teaserStart = '00:00:00'
$teaserDurationSeconds = 15
ffmpeg -y -ss $teaserStart -t $teaserDurationSeconds -i "$captureDir\aidd-walkthrough.mp4" `
    -vf "fps=12,scale=960:-2:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=96[p];[s1][p]paletteuse=dither=bayer" `
    -loop 0 "$captureDir\aidd-walkthrough-teaser.gif"
```

Inspect readability and keep the GIF below 10 MB; use MP4 for the full walkthrough.

## Acceptance checklist

- The terminal shows the real tagged source-release command, not a development checkout.
- The panel is `http://127.0.0.1:3291` and the Dashboard is genuine.
- Settings uses Workspace and Run Engine.
- The demo project was already aidd-managed and is disposable.
- The recipe is launched from the top-level Recipes page.
- The recording shows an authentic pipeline status transition and full report.
- The result segment does not claim there is a generic artifact view on run detail.
- No secrets, private projects, usernames, absolute paths, notifications, or unrelated tabs appear.
- Every project name visible in the final cut is on the public-project allowlist or is the neutral
  demo name.
- Release and capture provenance is recorded; later capabilities appear only in a walkthrough
  explicitly labelled as a later demonstration.
- No source narrower than 1440px was upscaled or repeatedly resized; 720 CSS-pixel stills use a
  1440px-wide source.
- The full MP4 is legible at normal playback speed.
- The teaser GIF is short, readable, and below 10 MB.
- `nomadicdaddy.github.io/aidd` is spelled correctly.
- The browser session is closed and the source-release panel is stopped after capture.

Cleanup with `agent-browser --session $browserSession close`, then run `bun run stop:web` from
`$releaseDir` in the same isolated recording profile. The default launcher is detached; Ctrl+C
in its original terminal does not stop that panel. Verify port 3291 is released. Preserve capture
state for review; never delete an unresolved path or an existing installation's `data/` directory.
