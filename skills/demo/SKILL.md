---
name: demo
description: Make a demo video of the app, from a storyboard the user approves on a local webpage: a screen-recorded walkthrough of the real app (Claude drives it, so zooms, cursor, clicks and keystrokes are exact), a motion-graphics launch video, or a hybrid of both, in the product's own look, rendered to MP4 with captions in 16:9, 9:16 and 1:1. Changes no project code. Run as /naqsha:demo <what the video is for>.
argument-hint: "<what the video is for>"
disable-model-invocation: true
---

# Naqsha: demo

The user decides what their demo says and how it looks; you storyboard it, show the options,
record the real app, compose and render it. The deliverable is a video they've approved
scene by scene, not a recording they have to fix. You change no project code: everything
goes in the demo's folder.

The request: $ARGUMENTS

The hook's message above ("Naqsha demo: …") names the demo's folder, earlier demos, where
the product's design tokens are, and how the app runs. If it's missing, ask the user to
send `/naqsha:demo <what it's for>` as a message of its own.

## Rules

- **Only what the app really does.** Every feature shown works in the build being
  recorded. No invented metrics, testimonials, customer logos or "coming soon" shown as
  done. A concept shot is labeled as one on screen.
- **Demo data only.** Record against a local or staging run with seeded, made-up data: no
  real customer records, real emails, credentials or production. Mask anything sensitive
  (`masks` in the shot); the masks follow the page frame by frame.
- **Show options, never just describe them.** Every visual choice (the look, the title
  card, a callout, the outro, the pacing) reaches the user as two to four rendered options
  on the page, as `/naqsha:design` does. In chat, only say how many are waiting.
- **Right the first time.** Never write a script, run it, fix the first error and run it
  again until it works. Use the tested pieces (`capture.mjs`, `compose.cjs`,
  `naqsha-demo.js`), check before running (`compose.cjs --env` and `--check`, a rehearsal
  for every shot), and when something does fail, find the cause, fix every place it
  applies, and say what it was.
- **It gels with the product.** Motion graphics use the product's design: the approved
  design's tokens, or the system in the code. The creative bar is the design skill's: the
  level of an Awwwards Site of the Day, with clean, purposeful motion
  (`${CLAUDE_PLUGIN_ROOT}/skills/build/references/interface.md`, "Motion"), never a stock
  template.
- **Captions by default, sound only by choice.** Burned-in captions and an `.srt`. A voice
  is the user's choice: a local voice (offline, free), or a provider such as ElevenLabs or
  OpenAI with their key, which sends the script to that provider, so only with their
  explicit yes. Music only if the user provides it or it's licensed for this use, with the
  license recorded.

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

## 2. The brief

On the page, in phases, only what the user knows:

- **What it's for and where it goes:** the landing page, a launch (Product Hunt, X,
  LinkedIn), YouTube, docs, a sales or investor deck. That sets the length (a social cut
  15 to 30 s, a landing loop 20 to 40 s, a walkthrough 60 to 90 s), the formats, and
  whether it must work muted (assume it must).
- **Who watches,** and the one thing they should remember and do afterwards.
- **What it shows:** the moment the product clicks for a user, and the two or three
  features that matter most. Fewer is stronger.
- **The kind:** a recorded walkthrough, a motion-graphics video, or a hybrid (the
  default): motion graphics for the hook, the callouts and the end, the real app for the
  proof. The storyboard decides per scene.
- Brand and tone, narration (captions by default), music (none by default).

Then learn the product yourself: its design (the hook names it), how it runs (the hook
names `testing.runIt` or the codebase map), its flows (a plan's digest, if there is one),
and screenshots of the screens you'll show.

## 3. The storyboard

Write `story` and `scenes`. The shape that works: a **hook** in the first two seconds (the
outcome, not the logo; frame 0 is the thumbnail on social players, so it's never empty),
the **problem** in a line, the **moment it clicks** shown in the real app, two or three
**features** each as one scene, and the **call to action**. One idea per scene. Give each
scene its caption (verbatim) and a `make` block saying what it is: a `title`, a
`statement`, a `terminal`, a `recording` or an `end` card (`demo-format.md` has each).
Captions need about 0.5 s plus 0.3 s a word on screen, at least 2 s.

The wording is a conversation, not a page: settle it with the user in chat.

## 4. Templates: the look, chosen from real clips

A still can't show motion, so the look is chosen from **rendered 10 to 15 second clips**,
never from descriptions or static previews. Each clip runs the same short script (the
hook, one recorded moment, the end card) and differs only in look and motion.

1. Record the one shot the samples need first (production steps 1 to 4), so every
   template shows the real product.
2. Set `look` in `plan.js` (fonts downloaded into the demo folder; see `demo-format.md`).
3. For two or three templates: `node "${CLAUDE_PLUGIN_ROOT}/assets/demo/compose.cjs" <demo>
   --sample <template> --entrance <mask|snap|cut>`, then `npx hyperframes check` and a
   render at `--quality looks` to `renders/template-<template>-<entrance>.mp4`. Templates:
   `signal` (dark, heavy type, one accent), `paper` (light, serif, calm), `blueprint`
   (navy grid, a line that draws). Pick the two or three that fit the product's design and
   the brief, in its tokens' colors where the product has a design.
4. Look at a frame from each clip yourself (frame 0 shows the hook; the recording fills
   its window) before showing them.
5. Put them on the page as a decision whose options carry `video`. The user watches and
   picks. Production of the full film starts on their word.

## 5. Production

Follow `${CLAUDE_SKILL_DIR}/references/production.md`; read it now. It is built to work the
first time: check the tools, rehearse every shot, validate the whole storyboard with
`compose.cjs --check` (it reports every problem at once), then compose, check, look and
render. Record the renders in `plan.js`; the Video tab plays them.

## 6. Review

The user watches on the page and comments at a timestamp ("[0:12] the zoom is too fast").
What they send arrives like page answers do. Fix what they asked, re-render only the
formats it touches, and say in a line what changed. Running `/naqsha:demo` again with the
same slug picks the storyboard up where it is.
