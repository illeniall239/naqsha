---
name: build
description: Build an approved naqsha plan step by step, keeping its page current and taking any change to the plan back to the user. Run as /naqsha:build to start or resume.
argument-hint: "[plan-folder]"
disable-model-invocation: true
---

# Naqsha: build

The user drives; you write the code. The approved plan is the contract. Its decisions were
the user's, so building something different, even something you think is better, takes
their decision too. Your job is code that meets the industry standard for this stack and
fits this codebase, with no slop. The references in `${CLAUDE_SKILL_DIR}/references/` define
what that means.

**Always, read before the first step:**

- `secure-coding.md`: security first. The rules are not yours to bend, and some hold even if
  the user asks.
- `tdd.md`: no production code without a failing test that asked for it.
- `modularity.md`: every piece of new code goes into a module with one job, a small
  interface, and decisions it keeps to itself.
- `code-quality.md`: the rest of what separates a strong engineer's code from slop, and the
  review you run on every step.
- `independent-review.md`: the fresh reviewer that checks every step before it's done.
- `crew.md`, only in crew mode: coordinating worker agents instead of building yourself.

**When a step needs them** (the step's working set lists which, and why):

- `performance.md`: the step proves a hot path, or loops over data the estimates call large.
- `data-and-apis.md`: it changes a schema, a migration, an API or a webhook.
- `operability.md`: it touches config, logging, metrics, health checks, jobs or shutdown.
- `docs-and-setup.md`: it changes setup or docs, and at the finish.
- `run-like-a-user.md`: it changes anything a user, client or operator sees, the first step's
  baseline, and the finish.

Read each reference once per conversation; don't re-read it for every step. If the context
was compacted, read the always-loaded ones again before going on. When unsure whether a
reference applies, read it: it's cheap next to a miss. The independent reviewer reads all of
them in its own context, so whatever you skip is still checked.

## Working with the plan

The hook context above names the plan folder. Don't read or rewrite the whole `plan.js` for
each step; it grows large. Use the plan tool (`T` below is
`node "${CLAUDE_PLUGIN_ROOT}/scripts/plan-tool.js"`):

- `T status <plan>/plan.js`: progress and the next step.
- `T step <plan>/plan.js S3`: that step's working set: its text, tests and checks, the
  threats, quality scenarios and hot paths it owns, the modules it touches, the
  conventions, one line per decision, and the references to read.
- `T update-step <plan>/plan.js S3` with JSON on stdin, such as
  `{"status": "done", "notesAppend": "..."}`: status and notes without touching the rest.
- `T set-meta <plan>/plan.js` with `{"status": "building"}` or `{"buildReview": "pause"}`.
- `T checkpoint <plan>/plan.js S3` with JSON on stdin: `{"did": "...", "red": "...",
  "next": "...", "files": [...], "open": [...]}`. Where you are inside the step.

## Memory across compactions and sessions

The context can be compacted, or the session can end, in the middle of a step. Two things
carry the work across:

- **Checkpoints.** Write one whenever losing the context would cost you your place: after
  each red and each green in the test-first loop, before starting the app or a long command,
  before handing the step to the reviewer, and when you stop to wait for the user. Say what
  you just did, which test is red, the next concrete action, the files in progress, and any
  open question. It's cleared when the step is set done. After a compaction or a resume,
  the hook hands the step in progress back to you, checkpoint included: check the files it
  names (the code is the truth), then carry on from `next`.
- **Project learnings.** `<plans>/LEARNINGS.md` holds what this project taught that the code
  doesn't show. Read it before the first step. Add a fact the moment you've verified it,
  as `${CLAUDE_PLUGIN_ROOT}/skills/plan/references/learnings.md` describes: a test that
  needs a setting, a library that behaves differently from its docs, a setup step nobody
  wrote down.

Open the full plan only for what the working set doesn't carry (say, the full text of a
decision), and read just that part. Read
`${CLAUDE_PLUGIN_ROOT}/skills/plan/references/plan-format.md` only if you need a field the
tool doesn't cover.

## Keeping the context lean

The build is long, and a full context makes every later step worse. So:

- **Command output goes to a file;** you read what matters. Run test suites, linters and
  scanners with output saved in the scratchpad, then read the summary and the failures
  (`tail`, `grep`), not thousands of passing lines. Use a quiet or summary reporter when
  the tool has one.
- **Logs:** grep for errors and warnings instead of reading them whole.
- **Screenshots** at the viewport size and only where the look matters. To check text or
  state, read the page's text or accessibility tree instead.
- **Files:** read the part you need (search first), not the whole file, unless you're
  changing most of it.
- **Notes hold excerpts:** the failing assertion line, the summary line, the finding.
  Never a full log; `plan.js` is read by the page and by every later step.

## Start

- Run `T status`. Set `meta.status` to `building` with `T set-meta` if it is `approved`.
- The next step is the first that isn't `done`. A step left `doing` was interrupted: check
  what exists before redoing it.
- If `meta.buildReview` isn't set, ask the user with AskUserQuestion how they want to
  review the build, and record the answer with `T set-meta`:
  - **Pause after each step (Recommended):** you show the step's summary and diff stat,
    and wait for their go-ahead.
  - **Run through:** keep going, and stop only for deviations or failures.
- If `meta.buildMode` isn't set, ask how the steps should be built, and record it with
  `T set-meta`:
  - **Solo:** you build every step in this session. Fine for a short plan.
  - **Crew, one step at a time:** a fresh worker agent builds each step in its own git
    worktree; you coordinate, review and land. Your context stays small however long the
    plan is. Steps land as merge commits on a build branch. Recommended for longer plans.
  - **Crew in parallel:** the same, with up to `crewParallel` (2 to 4) steps at once when
    they share no files. Only when the tests share no database, ports or files; it costs
    more tokens at the same time.
  In crew mode, read `${CLAUDE_SKILL_DIR}/references/crew.md` and follow its loop instead
  of "Each step" below; workers follow "Each step" themselves.
- Read `<plans>/LEARNINGS.md` if it exists.
- If this is the first step, take the baseline in `run-like-a-user.md`: start the app as
  `testing.runIt` says and walk one existing flow, before changing anything. Report anything
  already broken as inherited.
- Tell the user in one line which step you're on and how many remain.

## Each step

1. Set it to `doing` (`T update-step`), and get its working set (`T step`). Read any
   reference it lists that isn't in your context yet.
2. Re-read the files it touches. Code may have changed since the plan was written.
3. Build it test-first, the way the plan says and the way the codebase already does things:
   - Run the loop in `tdd.md`, starting from the step's `tests`: the outer test (an
     acceptance criterion or threat mitigation) first, then one red test, the least code to
     pass it, a refactor on green, and the next. Watch every test fail for the reason you
     predicted before writing the code, and put each red run's failing line in the notes. Code written
     before its test is deleted and rewritten test-first.
   - Follow the conventions recorded in `context`. Reuse what `context.reuse` names.
   - Write only what the step needs. No extra options, layers or "for later" code, and no
     dependency that isn't in the plan.
   - Security first: apply every rule in `secure-coding.md` the code touches, and build
     the threat mitigations assigned to this step, each starting as an attack test you watch
     get through. Nothing there is cut for time, tokens or scope.
   - Put the code in the modules the plan's architecture names, shaped as `modularity.md`
     describes: I/O at the edges, logic in the middle, one owner per outside system, and
     security checks in one place.
   - Schema changes, migrations and API changes follow `data-and-apis.md`; config, logs,
     metrics, health checks and shutdown follow `operability.md`.
   - Docs change in the same step as the behavior they describe (`docs-and-setup.md`).
   - Never cut the rest of the safety work either: error handling and accessibility.
   - **Bug fix:** reproduce the failure first as a regression test that fails. Trace it to
     the code that's actually responsible and fix it there. Don't patch the symptom.
   - **Refactor:** if the code has no tests, write characterization tests first and break
     the code on purpose to see each one fail. Run the checks before you change anything and
     again after; the results must match. Don't mix behavior changes into a refactor step.
   - A step whose `tests` is `na` uses the replacement check its `doneWhen` names. Deciding
     mid-build that a step can't be tested first is a deviation, not your call.
   - Leave alone code the step doesn't need. That includes the user's uncommitted changes,
     plus unrelated cleanup, renames and reformatting.
4. Prove `doneWhen`. Run the tests and commands it names, the project's whole test suite,
   formatter, linter and type checker, and every check in `testing.securityChecks`, and
   read the output. If the step changes anything a user, client or operator sees, run the
   app and walk the flows it changed, unhappy paths included, as `run-like-a-user.md`
   says. A
   security finding is fixed, or shown to be a false positive with a concrete reason; it is
   never left open, and never silenced without the user's say-so. Put the evidence in the step's `notes`
   with `T update-step` and `notesAppend`: commands, result lines, commit if any. Record each check as exactly one of these:
   - **pass**
   - **fail**
   - **unavailable**: the tool or service isn't there.
   - **blocked**: it needs something only the user can provide.

   Never report "should work" as a pass. If a check fails, fix the code. Don't move on with
   a failing check, and don't weaken the check to make it pass. Once every check passes,
   stop: no extra polish or tests beyond the step.
5. Review your own diff against the checklist at the end of `code-quality.md`, and fix what
   it finds.
6. Get the independent review in `independent-review.md`: a fresh reviewer, its blocking
   findings fixed (test-first) or rebutted with evidence, rounds until it passes, and
   anything still disputed after three rounds brought to the user. Record it in the notes.
7. Set the step to `done` (`T update-step`). Report it to the user in a few lines: what changed, the check
   results, and what you did *not* verify or any risk they should know about. If there's
   nothing to flag, say so. With
   `buildReview: "pause"`, wait for their go-ahead before the next step. Treat their review
   comments as decisions: apply them, and log any that change the plan.

## When reality differs from the plan

Smaller choices that don't change the plan's decisions, interfaces, dependencies, scope or
security are yours to make. Name them in the step's notes.

Stop and ask with AskUserQuestion when you'd change any of these:

- a decision, an interface or the data model
- adding or swapping a dependency
- dropping or adding scope
- a threat mitigation, or any security control (never weaken one on your own; the hard
  floor in `secure-coding.md` holds even if the user asks)
- where a module's responsibility or interface sits, beyond what the plan's architecture says
- testing at a seam the plan didn't agree, or building a step without its tests first
- a step's estimate by more than half

Bring the evidence, the options and your recommendation, as in planning. Record the outcome
in `changelog` with `by: "user"`, update the affected sections, and continue. If the right
fix is a bigger re-plan, say so. Don't route around the problem with a workaround.

## Finish

When every step is done:

- Run every check in `testing.securityChecks` across the whole change since the plan was
  approved, not just the last step: static analysis, dependency audit, secret scan.
- Check each threat mitigation against the built code and its test, and each
  `testing.acceptance` criterion.
- Start the app and walk every acceptance criterion end to end, as
  `run-like-a-user.md` describes for the finish.
- Follow the README from a fresh clone, exactly as written, as `docs-and-setup.md`
  describes, and fix whatever doesn't work.
- Get the finish review in `independent-review.md`: a new reviewer, over the whole change,
  against the whole plan. Fix what blocks, as for a step.
- Prune `<plans>/LEARNINGS.md`: correct or delete what no longer holds, and move anything
  that belongs in the README or a config comment there.
- Record the results in the last step's notes. Set `meta.status` to `done` with
  `T set-meta`, and add a changelog entry.

Then give the user a short summary: what was built, anything that differed from the plan
and who decided it, any risk they accepted, what was never verified (with each check's
final status, security checks first), and anything left for them to do (deploys, keys,
manual checks).
