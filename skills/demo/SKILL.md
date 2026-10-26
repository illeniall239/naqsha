---
name: demo
description: Make a demo video of the app that's directed, not templated. The user picks from three storylines on a local webpage, each with a rendered clip of how it opens. Claude records the real app (zooms, cursor, clicks and keystrokes exact), builds the motion graphics in the product's own look with caused transitions, kinetic type and UI sound, reviews it like a motion director, and renders an MP4 with captions. Changes no project code. Run as /naqsha:demo <what the video is for>.
argument-hint: "<what the video is for>"
disable-model-invocation: true
---

# Naqsha: demo

The user decides what their demo says and which film it is; you direct it. That means a
storyline with a device and a form, a look taken from the product, a transition with a
cause at every seam, the real app as the proof, and a review pass as a harsh motion director
before they see it. The deliverable is a film they've approved scene by scene, not a
slideshow of features. You change no project code: everything goes in the demo's folder.

The request: $ARGUMENTS

The hook's message above ("Naqsha demo: …") names the demo's folder, earlier demos, where
the product's design tokens are, and how the app runs. If it's missing, ask the user to
send `/naqsha:demo <what it's for>` as a message of its own.

## Rules

- **Only what the app really does.** Every feature shown works in the build being
  recorded. No invented metrics, testimonials, customer logos or "coming soon" shown as
  done. A rebuilt screen uses the product's real labels, taken from the code; a concept shot
  is labeled as one on screen.
- **Demo data only.** Record against a local or staging run with seeded, made-up data: no
  real customer records, real emails, credentials or production. Mask anything sensitive
  (`masks` in the shot); the masks follow the page frame by frame.
- **Directed, not templated.** Read `${CLAUDE_SKILL_DIR}/references/direction.md` before
  the storylines, and hold the film to it: a story with a spine, a look with a source,
  varied entrances, 3 to 5 kinds of caused transition, none of its generated-film tells. The
  composer's kit covers the common scenes; when the film needs something it doesn't do (a
  morph, a rebuilt panel, a color flood, a cursor-driven sequence), write that scene by hand.
- **Show options, never just describe them.** Every visual choice (the storyline, a scene
  the user is unsure of, the end card) reaches the user as rendered clips on the page. In
  chat, only say how many are waiting.
- **Right the first time.** Never write a script, run it, fix the first error and run it
  again until it works. Use the tested pieces (`capture.mjs`, `compose.cjs`,
  `naqsha-demo.js`), check before running (`compose.cjs --env` and `--check`, a rehearsal
  for every shot), and when something does fail, find the cause, fix every place it
  applies, and say what it was.
- **Captions by default; sound by choice, licensed.** Burned-in captions and an `.srt`,
  since most feeds play muted. UI sounds come from the HyperFrames pack (Pixabay Content
  License: free for commercial use). Music only from the user, or a track whose license
  allows this use (CC0, CC BY with its credit, or bought), with the license recorded. A
  voice is the user's choice: a local voice (offline, free), or a provider such as
  ElevenLabs or OpenAI with their key, which sends the script to that provider, so only with
  their explicit yes.

## 1. Set up

- Choose a slug; the demo lives in `<plans>/demos/<slug>/`:
  `mkdir -p <demo> && cp "${CLAUDE_PLUGIN_ROOT}/assets/plan.html" <demo>/index.html`
- Write `<demo>/plan.js` with `meta.kind: "demo"`, in the format in
  `${CLAUDE_SKILL_DIR}/references/demo-format.md`; read it now.
- Start the page: `node "${CLAUDE_PLUGIN_ROOT}/scripts/serve.js" start <demo> --open`, and give
  the URL in one line. Ask on it as "Asking on the page" in
  `${CLAUDE_PLUGIN_ROOT}/skills/plan/SKILL.md` describes (read that section): rounds in
  phases, a background `wait`, no unattended loop.
- Check the tools now, not after the storyboard:
  `node "${CLAUDE_PLUGIN_ROOT}/assets/demo/compose.cjs" --env` (Node 22 or later, FFmpeg),
  and Playwright in the project (or `npx playwright install chromium`). Say plainly what's
  missing.
- HyperFrames ships its own craft skills (`npx hyperframes skills`), installed into the
  user's AI tools. They go deeper than `direction.md` on motion and sound, but that install
  is outside this project: offer it in a line, and run it only on the user's yes.

## 2. The brief

On the page, in phases, only what the user knows:

- **What it's for and where it goes:** the landing page, a launch (Product Hunt, X,
  LinkedIn), YouTube, docs, a sales or investor deck. That sets the length (a social cut
  15 to 30 s, a landing loop 20 to 40 s, a walkthrough 60 to 90 s) and whether it must work
  muted (assume it must).
- **Who watches,** and the one thing they should remember and do afterwards.
- **What it shows:** the moment the product clicks for a user, and the two or three
  features that matter most. Fewer is stronger.
- **References:** a film or a brand they like the feel of (its grammar, never its content).
- **Sound:** UI sounds (on by default), music (theirs, a licensed track you find with them,
  or none), narration (captions by default).

Then learn the product yourself: its design (the hook names it: tokens, fonts, the
screens), how it runs (`testing.runIt` or the codebase map), its flows, the real numbers
and labels you can show, and screenshots of the screens you'll use.

## 3. Three storylines

Write `storylines` (`direction.md` section 2): three films that differ in device, form and
world, one of them bold, your recommendation first. Each gets a `hook`: its look and the
scenes of its first five seconds or so, so the user watches how each film opens, not a
description of it.

1. Record the shots the hooks need first (production steps 1 to 4), so every hook shows the
   real product.
2. For each storyline:
   `node "${CLAUDE_PLUGIN_ROOT}/assets/demo/compose.cjs" <demo> --storyline <id>`, then
   `npx hyperframes check` in `video/`, look at frame 0 and the middle
   (`npx hyperframes snapshot --at 0,2.5 --describe false`), and render at `--quality draft`
   to `renders/storyline-<id>.mp4` (its `clip`).
3. Put a decision on the page whose options carry `storyline` (and nothing else to read:
   the page shows each storyline's device, form, opening, beats, look, sound and clip). The
   user watches and picks; a mix ("S1's opening with S3's ending") is one storyline.

Picking a storyline picks its look and its sound: copy its `hook.look` to `look`, and its
hook scenes become the start of `scenes`.

## 4. The storyboard

From the picked storyline, write `scenes` (`demo-format.md` has each type): beats from
`direction.md` section 3, one idea per scene, each with its caption (verbatim; about 0.5 s
plus 0.3 s a word on screen, at least 2 s), its `make`, and, from the second scene on, its
`transition`: how it arrives, caused by something on screen. Worlds change through
`ground`. Where the kit stops, a scene is `custom`: a hand-made scene in
`scenes/<id>.html` (`production.md` has the contract). The wording is a conversation, not a
page: settle it with the user in chat, then show the storyboard on the page.

## 5. Production

Follow `${CLAUDE_SKILL_DIR}/references/production.md`; read it now. It is built to work the
first time: check the tools, rehearse every shot, validate the whole storyboard with
`compose.cjs --check` (it reports every problem at once, and notes the film's weak spots:
too many hard cuts, one entrance everywhere, a default font, silence), then compose,
check, review, render. Record the renders in `plan.js`; the Video tab plays them.

## 6. Review

Before the user sees it, review the film yourself as `direction.md` section 10 says: the
check, the review sheets, every beat frame described as a stranger would, P0 and P1 notes
fixed. Then the user watches on the page and comments at a timestamp ("[0:12] the zoom is
too fast"). What they send arrives like page answers do. Fix what they asked, re-render
only what it touches, and say in a line what changed. Running `/naqsha:demo` again with the
same slug picks the film up where it is.
