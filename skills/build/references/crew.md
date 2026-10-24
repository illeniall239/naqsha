# Crew mode

In crew mode you stop building and start coordinating. Each step is built by a fresh worker
agent in its own git worktree, a separate reviewer checks it, and you land it. Why: your
context stays small however long the plan is, every step starts with a clean head, and
steps that don't touch the same files can run at the same time.

This borrows firstmate's discipline (github.com/kunchenguid/firstmate): one liaison, workers
supervised and not trusted, scripts for the mechanics, and unlanded work never thrown away
quietly.

## Rules

- **You are the only one who talks to the user.** Workers report to you. Bring the user
  outcomes and real decisions, not progress chatter.
- **You are the only one who writes `plan.js`,** through the plan tool. Workers never touch
  it, so parallel workers can't overwrite each other.
- **Workers are supervised, not trusted.** A step lands only after the independent review
  passes and its checks pass on the build branch.
- **Unlanded work is never discarded without the user's word.** `crew.js drop` refuses
  without `--force`, and you pass `--force` only when the user said so.
- **Mechanics are scripts:** `C` below is `node "${CLAUDE_PLUGIN_ROOT}/scripts/crew.js"`, and
  `T` is the plan tool.

## Starting

1. The main checkout must be on a build branch of its own, because steps land as merge
   commits. If it's on `main` or similar, ask the user before creating one (for example
   `git switch -c build/<slug>`).
2. In an existing codebase, take the checks' baseline yourself before starting any worker,
   as the build skill describes (`T baseline`). Every worker's working set then carries it.
3. Parallel runs need tests that don't share state: no common database, ports or files
   between two test runs. If the plan's testing strategy doesn't show that, keep
   `crewParallel` at 1.

## The loop

1. `T ready <plan>/plan.js` lists the steps to start now: dependencies done, no file shared
   with another step in flight, and within `crewParallel`.
2. For each of them:
   - `T update-step ... {"status": "doing"}`
   - `C open <plan>/plan.js S#`, which gives the worktree path and branch
   - `T step <plan>/plan.js S#`, which gives the working set
3. Start one worker per step with the Agent tool (general-purpose). Don't set `model`: the
   worker writes the code, so it runs on the session's model. Name it as the working set's
   "Names" section says: the description starts with the name ("Orion · build S5"), and the
   user hears "Orion is building S5". Give it the worker brief below with the brackets
   filled in. Run them in the background when there's more
   than one. Write a checkpoint naming the workers you're waiting on, then end your turn;
   you're woken when one reports.
4. When a worker reports:
   - **done:** if the step's working set says it needs an independent review, run it
     (`independent-review.md`) on the branch: the change under review is
     `git -C <worktree> diff <base>..HEAD`. Send blocking findings back to that worker
     (SendMessage) to fix test-first and commit, and repeat until the review passes. If it
     doesn't need one, read the worker's report and diff yourself against the step before
     landing; the checks after landing still apply.
   - **deviation:** the step can't be built as planned. Bring it to the user as the build
     skill describes, record the decision, and tell the worker what to do.
   - **blocked:** it needs something only the user can give. Ask, then pass it on.
   - **handoff:** its context grew long before the step was done. Write a checkpoint from
     its report, then start a fresh worker under the same name on the same worktree with
     the same brief, plus
     "resume from the commits already on your branch" and the report's next action. A
     fresh context costs far less than one that keeps growing.
5. Land it: `C land <plan>/plan.js S#`.
   - **On a conflict** (exit 2), nothing was merged. Ask the worker to merge the build
     branch into its branch, resolve, rerun its checks and commit, then land again.
6. On the build branch, after landing, run the project's whole test suite and the security
   checks, judged against the baseline as the build skill describes. If the step changed anything users see, walk it in the running app
   (`run-like-a-user.md`). You do this, one step at a time, never the workers: one app,
   one database, no collisions.
7. Record it. Use `T update-step` with `notesAppend` for the worker's evidence (its red-run
   lines and check results), the review's verdict, the landing commit and your own checks.
   Then set the status to `done`. Add the worker's verified learnings to
   `<plans>/LEARNINGS.md`. With `buildReview: "pause"`, report to the user and wait.
8. Back to 1 until `T ready` says all steps are done; then the build skill's finish.

## When something goes wrong

- **A worker stops without reporting, or its agent is gone:** its commits are on its branch
  (`C list` shows them). Start a new worker on the same worktree with the same brief and
  "resume from the commits already on your branch".
- **After a compaction or restart:** the hook hands you the step in progress. Run `C list`
  and `T ready` to see the whole crew again.
- **A step goes wrong for good:** stop and bring it to the user. Discarding its branch is
  their decision.

## Worker brief

```
You are [name], building one step of an approved plan, as a crew worker. You report to the
coordinator, not to the user, and you can't ask the user anything.

Your worktree: [path]. Your branch: [branch]. Work only there: run every command inside
it. Never touch the main checkout, and never edit plan.js; the coordinator records
everything.

Your step:
[the output of plan-tool.js step for this step]

How to build it: read [plugin root]/skills/build/SKILL.md, sections "Keeping the context
lean" and "Each step" items 2 to 5, and every reference your step lists under "References
to read" except independent-review.md; they're in [plugin root]/skills/build/references/.
Follow them exactly: test-first with each red run seen and noted, the security rules,
modules, and every check the step names. Don't run the app or an emulator; the coordinator
does that after landing.

Keep your context small: build, test and lint output goes to a file, and you read the
summary and the failures. If you pass about 60 tool calls and the step isn't done, stop at
the next green: commit, and report a handoff with what's done, the next action, and the
files in progress. A fresh worker continues from your commits.

Commit to your branch after each green and when you finish (git add, then git commit with a
message starting "[S#]"). Your commits are your checkpoints: if you're stopped, the next
worker resumes from them. Leave nothing uncommitted when you report.

Don't change the plan. If the step can't be built as written (a decision, an interface,
the data model, a dependency, the scope, a security control, a module boundary, or a step
much bigger than it lists), stop and report a deviation with the evidence, the options and
your recommendation.

Report, in this order:
- Status: done, handoff, deviation or blocked.
- What you built, in a few lines.
- Each check with pass, fail, unavailable or blocked, and its result line.
- The red runs: each test's failing line before its code existed.
- Problems that were already there in code you touched, as `found:` with file:line, if any.
- Verified learnings for the project's LEARNINGS.md (facts that cost time to find), if any.
- What you did not verify.
```
