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
  font's source (Google Fonts serves the files its CSS lists); use the product's own fonts,
  and check their licenses allow embedding in video.
- UI sounds, when `sound.sfx` is on: `C <demo> --fetch-sfx` downloads the HyperFrames pack
  (clicks, keys, typing, whooshes, a bass hit, a ping, a pop) into `<demo>/sfx/`, pinned to
  one commit, with its license in `CREDITS.md`.
- Music, when chosen: the file in `<demo>/audio/`, its license in `sound.music.license`.
  Then its beats: run `npx hyperframes beats` in `video/` once the track is placed, or
  `npx hyperframes audio <track> --only beats,bpm --json` (local by default; never pass
  `--quality best`, which uploads it), and save the beat times as `audio/beats.json`.

## 2. Recording the real app

1. **Start the app** as the hook's run instructions say, with demo data seeded. Never point
   a recording at production.
2. **Write the shot** for each recorded scene in `<demo>/capture/<shot>.json`, in the format
   at the top of `${CLAUDE_PLUGIN_ROOT}/assets/demo/capture.mjs`. Use `"viewport": { "width":
   1280, "height": 720 }, "scale": 1.5` for a sharp 1920 by 1080 video. Choose selectors a
   person would recognize (`text=Approve`, a label, a role, a test id), taken from the page
   itself (read its markup or a rehearsal screenshot), not guessed. Plan the clicks as the
   film's causes: a click can open the next scene (`zoom-through`, `grow` or `iris` start
   from the last click before the seam).
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

- `C <demo> --check` validates the whole storyboard and reports **every** problem at once:
  the look (hex colors, readable contrast, a source, fonts present), scene types and
  fields, recordings present, segments inside their recording, each caption given its
  reading time, transitions that can work (a `via` in the scene before; an iris onto another
  world), hand-made scenes keeping their contract, sounds present, music licensed. It also
  prints **notes**: the film's weak spots (more than a third hard cuts, under 3 kinds of
  transition, every title entering the same way, a generated-default font, hype words, a
  long film with no sound, seams off the beat). Fix them, or keep one on purpose and say
  why. Nothing is written until the check passes.
- `C <demo> --storyline <id>` writes a storyline's hook clip; `C <demo>` writes the full
  film. Both go into `video/index.html` (the composition HyperFrames checks and renders)
  with `video/index.motion.json` (assertions `check` verifies); a hook keeps a copy in
  `<demo>/samples/`. The full film writes each scene's real start (`at`) and length back to
  `plan.js`.
- What the composer does for you, so you don't redo it by hand: fonts loaded before
  anything is measured; the first line on screen at frame 0 (and on the first frame of a
  scene a transition carries in); entrances that seek right; recordings at their natural
  size with the camera, cursor, key chips, masks and a hit box at every click; each
  transition measured on the real element at its moment; every sound on the frame of its
  action; captions as chips that read over any screen; the end card performed and held.

### A hand-made scene

When the kit doesn't do what the film needs, write `scenes/<id>.html` and set the scene's
`make` to `{ "type": "custom", "src": "scenes/<id>.html" }` with its `seconds`. It holds
markup and one script:

```html
<div id="SC3-card" style="position:absolute;left:400px;top:170px;width:1120px;height:740px;
  background:var(--panel);border:2px solid var(--line);border-radius:30px;padding:60px 70px">
  <div id="SC3-h" class="ln" style="font-family:'D';font-size:60px"><span class="in">Your code is <em>locked</em></span></div>
  <div id="SC3-btn" style="position:absolute;left:70px;bottom:60px;padding:24px 44px;border-radius:18px;
    background:var(--ink);color:var(--ground);font-family:'M',monospace;font-size:42px">/naqsha:approve</div>
</div>
<script>
function scene(tl, at, d, k, c) {
  k.enter('#SC3-h', at + 0.15, 'mask');
  k.enter('#SC3-btn', at + 0.75, 'snap');
  const cur = k.cursor(c.stage, { size: 64 });
  cur.enter(at + 0.9, 760, 830);       // from off-screen to the button
  cur.click(at + 1.9);                  // the click causes the change, on its frame
  tl.to('#SC3-btn', { backgroundColor: c.accent, duration: 0.15, ease: 'none' }, at + 1.95);
}
</script>
```

- **The frame is 1920 by 1080.** The stage carries the scene's ground; place things in
  absolute pixels. Fonts are `'D'` (display), `'T'` (text) and `'M'` (mono); colors are
  `var(--ground)`, `--ink`, `--dim`, `--accent`, `--panel`, `--line` (the scene's world).
  `<em>` is the accent. A line that a `mask` entrance moves is `class="ln"` holding a
  `<span class="in">`.
- **`scene(tl, at, d, k, c)`:** `tl` is the film's one timeline; put everything on it at
  absolute times from `at` (the scene's start) to `at + d`. `k` is the kit
  (`${CLAUDE_PLUGIN_ROOT}/assets/demo/naqsha-demo.js` lists it: `enter`, `leave`, `type`,
  `odometer`, `cursor`, `frameOn`). `c` has `W`, `H`, `stage`, the colors and `spring`.
- **The contract** (`--check` enforces it): every id starts with the scene's id; no
  `data-start`, `data-duration` or clips inside (the timing is the scene's); deterministic
  only (no `Math.random`, no clock, no timers, no tween callbacks, which a seek skips); no
  network (images go in `<demo>/media/`, referenced as `assets/media/<file>`); no timeline
  of its own.
- **Seeking:** use `fromTo` with `immediateRender: false` for anything that must not show
  before its time, and `k.enter` for anything that appears (it hides it from frame 0 until
  its moment). Never two `set`s of one property on one element at the same moment. Tween
  targets are element references or plain ids, never combinators like `#a > .in`.
- **Sounds:** `make.sfx: [{ "at": 1.9, "sound": "click" }]`, in seconds from the scene's start.
- **Seams:** a following scene can `zoom-through` or `grow` from one of its elements
  (`"via": "#SC3-btn"`). For a `match` cut, make this scene's last frame and the next one's
  first frame the same picture.

## 4. Checking, reviewing and rendering

1. `npx hyperframes check` in `video/`: lint, runtime, layout, motion, contrast and craft
   (an empty first frame, a line too short to read, a dead stretch). The composer's output
   should pass first time; if it doesn't, the cause is in the storyboard, a hand-made scene
   or the composer, so fix it there, never in `index.html`.
   `nested_structure_needs_subcomposition` is expected (one timeline for the whole film, so
   transitions can cross scenes), and so is a contrast warning on the outgoing scene's text
   during a `grow` (the checker reads the growing shape as its background).
2. **Review** as `direction.md` section 10 says:
   `npx hyperframes snapshot --review --describe false` (the `--describe false` keeps frames
   off Gemini's API when a `GEMINI_API_KEY` is set), and `snapshot --at <t,…>` for single
   moments. Fix the P0s and worthwhile P1s together, at most three rounds.
3. **Render:** `npx hyperframes render --quality delivery --video-frame-format png -o
   <demo>/renders/<slug>-16x9.mp4` (`--quality draft` for storyline clips; `meta.fps: 60`
   renders at 60 fps). Then a poster:
   `ffmpeg -ss <the hook's best moment> -i <render> -frames:v 1 <demo>/renders/<slug>-poster.png`.
4. **Verify the file:** frames from the final MP4 at each scene and seam
   (`ffmpeg -ss <t> -i <render> -frames:v 1 frame.png`), `ffprobe` for duration, resolution
   and frame rate, and `npx hyperframes audio <render> --json` for where the sound lands
   and how loud it is.
5. **Captions:** `renders/<slug>.srt` and `.vtt` from the scenes' captions and their `at`
   and `seconds`.
6. Record each render in `plan.js` `renders` (file, format, seconds), the captions, the
   poster, the music's credit if it needs one, and the checks and review in `qa`.
