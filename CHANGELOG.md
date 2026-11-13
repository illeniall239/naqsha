# Changelog

Each release is one commit, `naqsha X.Y.Z: ...`, with the version in
`.claude-plugin/plugin.json`. Update with `claude plugin update naqsha@naqsha`.

## 0.18.1 (2026-11-13)

The progress row counts checklists: a list of items marked done (✓, [x]) and still to
come (*, [ ]), like `gh run watch` printing a CI run's jobs, shows as "3 of 4 jobs", with
any that failed. A stream of passed tests with no total still shows no number.

## 0.18.0 (2026-11-13)

A progress row above the prompt shows everything Claude and its agents are doing: every
tool call that runs past two seconds (commands, web fetches, searches, MCP tools), with a
real bar, the rate and the time left when its output says how far it has got (renders,
downloads, recordings) and its latest output line otherwise; each subagent with what it's
doing now and how many tools it has used; and the build's step. Background commands come
back after a reload, and a percent or count is only read from a line about progress. The demo's recordings and sound download print their progress for it,
and the demo runs its long jobs in the background so the row can show them.

## 0.17.2 (2026-11-09)

Windows works. The tests now run on Linux, macOS and Windows, and Windows turned up:

- **The lock missed Bash edits on Windows.** The snapshot matched git's paths to the
  project by comparing folder names, which fails when one is the short 8.3 form of the
  other, so every change looked like it was outside the project. It now asks git where
  the project sits. Crew mode finds the plans folder the same way.
- Paths naqsha stores and shows use `/` on every platform.
- A build's checkpoint no longer lists plan files as changed project files.

## 0.17.1 (2026-11-09)

- Tests run on Linux, macOS and Windows in CI.
- Plans with the same timestamp always sort the same way.
- A plugin icon, and documentation for contributors, security reports and this changelog.

## 0.17.0 (2026-11-08)

`/naqsha:demo` films are carried by the product, not slides: storylines come from a roll
of seven or more ideas, a `callout` scene puts a line in the real product, recordings
punch in only on named actions, the composer notes where a film reads as slides, and a
fresh reviewer sees the film before the user does.

## 0.16.0 (2026-11-08)

The build tunes itself after each step from its own measurements: the workers' hand-off
point, one whole-suite run per commit, and lessons from long reviews. The models, the
reviews and every test and check are never changed by it.

## 0.15.0 (2026-11-08)

See where the tokens go: each step's cost by role, with what looked wasted. Auto-compaction
is on by default, with a PreCompact hook that says what to keep. Every check still runs,
once.

## 0.14.1 (2026-11-08)

`/naqsha:approve` goes through the first time: `plan-tool.js check` runs the hook's own
check before Claude asks for approval, and a refusal reaches Claude too. A build turn
without a checkpoint is no longer blocked.

## 0.14.0 (2026-10-26)

`/naqsha:design` finds directions that aren't the default: seven worlds from the audience's
life, a roll that picks which become options, a direction contract, and screenshots of
every preview judged by a fresh reviewer.

## 0.13.0 (2026-10-26)

`/naqsha:demo` directs the film: storylines with rendered openings, the product's own look,
transitions with a cause, kinetic type, hand-made scenes and UI sound.

## 0.12.0 (2026-10-26)

The plan, learn and review pages get a real design.

## 0.11.0 (2026-10-25)

`/naqsha:demo`: demo videos of the app, recorded from the real app and rendered to MP4.

## 0.10.1 (2026-10-25)

Design choices are shown as options that fit the product.

## 0.10.0 (2026-10-25)

Faster steps, designs that check their data, leaner cost reports.

## 0.9.0 (2026-10-25)

A cost meter, `/naqsha:help`, and an up-to-date listing.

## 0.8.1 (2026-10-24)

Interface rules for a new app without a design.

## 0.8.0 (2026-10-24)

`/naqsha:design`: creative by default, motion and 3D, existing products.

## 0.7.0 (2026-10-24)

Reliability rules for the backend, tenant isolation, an audit trail.

## 0.6.1 (2026-10-24)

A crew build resumes cleanly after a restart or update.

## 0.6.0 (2026-10-24)

`/naqsha:review` and `/naqsha:learn`, safety for existing codebases, cheaper runs.

## 0.5.0 (2026-10-24)

No hour estimates, and a gate for skills started by mention.

## 0.4.0 (2026-10-24)

Effort levels, risk-based review, a precise state guard.

## 0.3.0 (2026-10-24)

Memory across compactions, crew mode.

## 0.2.0 (2026-10-24)

Answer on the page, stricter standards, a safer lock.

## 0.1.0 (2026-10-21)

Plan before code, with a user approval gate.
