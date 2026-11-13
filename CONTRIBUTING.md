# Contributing to naqsha

Thanks for helping. Bug reports, fixes, and ideas are all welcome. For anything bigger
than a fix, open an issue first so we can agree on the shape before you build it. That's
naqsha's own rule, too.

## How it fits together

- **`skills/<command>/SKILL.md`**: what Claude does for each `/naqsha:` command, with its
  references in `skills/<command>/references/`. These are instructions for Claude, so
  they're written as plain, direct prose: say what to do and why, with an example where it
  helps.
- **`scripts/hook.js`**: the hooks in `hooks/hooks.json`. It keeps project files locked
  while planning, records approval, checks a plan before it can be approved, and feeds
  context to the skills. It runs on every prompt and tool call, so it must stay fast and
  must never wedge a session: on an error it says why and lets the call through.
- **`hooks/progress.tsx`**: the progress row above the prompt, a hooks module that Claude
  Code runs in the session itself. It only watches: each hook passes its event on, and
  one that fails hands it on unchanged. What it reads out of a command's output is in
  `hooks/progress-read.mjs`. A script shows real progress by printing
  `@naqsha-progress {"done":3,"total":12,"unit":"steps","stage":"Recording"}`.
- **`scripts/plan-tool.js`**: what the build uses to read and update a plan one step at a
  time, measure cost (`cost.js`), tune the build, and run the approval check
  (`plan-tool.js check`).
- **`scripts/serve.js`**: the local server for the plan pages, on `127.0.0.1` behind a
  random key.
- **`assets/`**: the pages (`plan.html`, `learn.html`, `review.html`) and the demo
  composer (`assets/demo/`).
- **`test/`**: the tests, on Node's built-in test runner.

`plan.js` is a contract. The skills write it, the pages render it, and the hooks and
scripts check it. Its formats are in each skill's `references/*-format.md`. If you change
a field, change the format doc, the page, the hook or script that reads it, and their
tests in the same pull request.

## Working on it

```sh
git clone https://github.com/illeniall239/naqsha
cd naqsha
npm test                         # no dependencies to install
claude plugin test .             # the progress row, against Claude Code's own engine
claude plugin validate .         # the manifests and the hooks module
```

To try a change, open Claude Code in a scratch project with your copy loaded for that
session:

```sh
claude --plugin-dir /path/to/naqsha
```

Then run the command you changed, and check the page it makes.

## Conventions

- **No runtime dependencies.** The scripts run on Node 20 or later with its standard
  library only. The demo needs Node 22 or later, FFmpeg and Playwright, and checks for
  them before it starts.
- **Every platform.** Use `path.join`, never hand-built paths. Remember that git always
  reports paths with `/`. CI runs the tests on Linux, macOS and Windows.
- **Test what you change.** A fix comes with the test that failed without it. Tests make
  their own temporary projects and never touch your home folder.
- **Fail with the fix in the message.** When a script refuses something, it says what's
  wrong and what to do.
- **One release per change.** Bump `version` in `.claude-plugin/plugin.json`, add a
  `CHANGELOG.md` entry, and start the commit message with `naqsha X.Y.Z:` and what
  changed for the user. Without the version bump, `claude plugin update` won't pick the
  change up.

## Pull requests

Keep each one to a single change, say what it fixes or adds and how you checked it, and
make sure `npm test`, `claude plugin test .` and `claude plugin validate .` pass.
