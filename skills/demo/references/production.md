# Production: right the first time

Making a video is built from tested pieces, checked before they run, so it works on the
first attempt. Never write a script, run it, fix the first error, run it again and repeat.
When something does fail, find the cause, fix every place it applies, and say what it was.
HyperFrames changes fast: when its CLI says something different from this file, the CLI
wins (`npx hyperframes docs <topic>`, `npx hyperframes <command> --help`).

`C` below is `node "${CLAUDE_PLUGIN_ROOT}/assets/demo/compose.cjs"`.

## 1. Before anything runs

- `C --env`: Node 22 or later, FFmpeg and ffprobe. Install what's missing first (ask
  before installing anything system-wide).
- The HyperFrames project, once per demo, in `<demo>/`:
  `npx hyperframes telemetry disable` (it collects anonymous usage by default; tell the
  user you turned it off), then
  `npx hyperframes@<version> init video --example blank --non-interactive --resolution landscape`.
  Pin that version in `meta.engine` so a re-render months later matches.
- Fonts: the `look` names `.woff2` files in the demo folder. Download them once from the
  font's source (Google Fonts serves the files its CSS lists); prefer the product's own
  fonts, and check their licenses allow embedding in video.

## 2. Recording the real app

1. **Start the app** as the hook's run instructions say, with demo data seeded. Never point
   a recording at production.
2. **Write the shot** for each recorded scene in `<demo>/capture/<shot>.json`, in the format
   at the top of `${CLAUDE_PLUGIN_ROOT}/assets/demo/capture.mjs`. Use `"viewport": { "width":
   1280, "height": 720 }, "scale": 1.5` for a sharp 1920 by 1080 video. Choose selectors a
   person would recognize (`text=Approve`, a label, a role, a test id), taken from the page
   itself (read its markup or a rehearsal screenshot), not guessed.
3. **Rehearse:** `node "${CLAUDE_PLUGIN_ROOT}/assets/demo/capture.mjs" <shot> --rehearse` from the
   project folder, so its Playwright is used. It runs every step for real with no video,
   screenshots each one, and reports every failing step at once (a selector missing, or
   covered by something else). Look at the screenshots: does each step show what the scene
   needs? Fix all of it, then rehearse once more.
4. **Record:** the same command without `--rehearse`. It writes `recording.webm` (from
   Chrome's screencast at device pixels, frame-exact to the log) and `events.json` (every
   move, click, keystroke and scroll, with masks tracked on every frame).
5. **Choose the windows** from `events.json`, not by eye: each `make.segments` entry is a
   `[from, until]` in the recording's seconds, from a little before the first action you
   want to just after the last one settles. Cut idle stretches by using two segments.

## 3. Composing

The composer turns the storyboard into the HyperFrames composition, with every lesson from
real renders built in:

- `C <demo> --check` validates the whole storyboard and reports **every** problem at once:
  scene types and fields, recordings present, segments inside their recording, every
  caption given its reading time, fonts present, the project initialized. Fix them all,
  then check once more. Nothing is written until it passes.
- `C <demo> --sample <template> --entrance <entrance>` writes a template clip (section 4 of
  the skill); `C <demo>` writes the full film. Both go into `video/index.html`, the
  composition HyperFrames checks and renders; samples keep a copy in `<demo>/samples/`.
- What it does for you, so you don't redo it by hand: videos with ids and their own timing
  (never their wrapper's), recording layers at the video's natural size with events
  scaled to match, the camera, cursor, ripples, key chips and masks from the log, nothing
  shown before its entrance, entrances varied by role (the template's signature for
  titles, a quick reveal for captions, typing for terminals), the first title on screen at
  frame 0, the end card held.
- A scene no `make` type covers: add the type to the composer if it will come up again, or
  write that one scene by hand as a sub-composition (`data-composition-src`), following
  the contract below, and say which scene is hand-made.

The contract, for anything written by hand (`npx hyperframes docs compositions`,
`data-attributes`, `gsap`): a root element with `data-composition-id`, `data-width`,
`data-height`; every timed element has `data-start`, `data-duration` and `class="clip"`; one
paused GSAP timeline per composition on `window.__timelines["<id>"]`; deterministic only
(no `Date.now()`, no `Math.random()`, no network fetches); fonts and images local. Learned
the hard way: a `<video>` needs an `id` and its own timing; its CSS size must equal its
natural size; tween targets are element references or plain ids, never combinators like
`#a > .in`; never two `set`s of one property on one element at the same moment; use
`immediateRender: false` on anything that must not show before its time.

## 4. Checking and rendering

1. `npx hyperframes check` after composing: lint, runtime, layout, motion, contrast, and
   craft notes (an empty first frame, a line too short to read). The composer's output
   should pass first time; if it doesn't, the cause is in the storyboard or the composer,
   so fix it there, not in `index.html`.
2. **Look:** `npx hyperframes snapshot --at <seconds>` at every scene's middle and each
   recording's key moments, and read the contact sheet. Judge against the storyboard and
   the chosen template: text readable at phone size, the cursor visible, the action
   centered, the recording filling its window, nothing sensitive showing. Fix the three
   biggest problems together, at most three rounds.
3. **Render:** `npx hyperframes render --quality delivery --video-frame-format png -o
   <demo>/renders/<slug>-16x9.mp4` (`--quality looks` for template clips). Then a poster:
   `ffmpeg -ss <the hook's best moment> -i <render> -frames:v 1 <demo>/renders/<slug>-poster.png`.
4. **Verify the file:** frames from the final MP4 at each scene (`ffmpeg -ss <t> -i <render>
   -frames:v 1 frame.png`), and `ffprobe` for duration, resolution and frame rate.
5. **Captions:** `renders/<slug>.srt` and `.vtt` from the scenes' captions and timings.
6. Record each render in `plan.js` `renders` (file, format, seconds), the captions, the
   poster, and the checks in `qa`.

## Sound, when chosen

A separate `<audio>` per track; `npx hyperframes normalize-audio` to match levels; music
ducked under any voice; a voice's script is the captions.
