---
name: build
description: Build an approved naqsha plan step by step, keeping its page current and taking any change to the plan back to the user. Run as /naqsha:build to start or resume.
disable-model-invocation: true
---

# Naqsha: build

The user drives; you write the code. The approved plan is the contract. Its decisions were
the user's, so building something different, even something you think is better, takes
their decision too. Your job is code that meets the industry standard for this stack and
fits this codebase, with no slop. `${CLAUDE_SKILL_DIR}/references/code-quality.md` defines
what that means. Read it before the first step.

The hook context above names the plan folder. Read its `plan.js`, and
`${CLAUDE_PLUGIN_ROOT}/skills/plan/references/plan-format.md` if the format isn't in context.

## Start

- Set `meta.status` to `building` if it is `approved`.
- Find the first step that isn't `done`. A step left `doing` was interrupted: check what
  exists before redoing it.
- If `meta.buildReview` isn't set, ask the user with AskUserQuestion how they want to
  review the build, and record the answer:
  - **Pause after each step (Recommended):** you show the step's summary and diff stat,
    and wait for their go-ahead.
  - **Run through:** keep going, and stop only for deviations or failures.
- Tell the user in one line which step you're on and how many remain.

## Each step

1. Set it to `doing`, and update `meta.updated`.
2. Re-read the files it touches. Code may have changed since the plan was written.
3. Build it the way the plan says, the way the codebase already does things:
   - Follow the conventions recorded in `context`. Reuse what `context.reuse` names.
   - Write only what the step needs. No extra options, layers or "for later" code, and no
     dependency that isn't in the plan.
   - Never cut the safety work: validation, auth checks, error handling, the threat
     mitigations assigned to this step, and accessibility.
   - Tests for the step's logic are part of the step, not a later step.
   - **Bug fix:** reproduce the failure first, with a failing test when you can. Trace it
     to the code that's actually responsible and fix it there. Don't patch the symptom.
   - **Refactor:** run the checks before you change anything and again after; the results
     must match. Don't mix behavior changes into a refactor step.
   - Leave alone code the step doesn't need. That includes the user's uncommitted changes,
     plus unrelated cleanup, renames and reformatting.
4. Prove `doneWhen`. Run the tests and commands it names, plus the project's formatter,
   linter and type checker, and read the output. Put the evidence in the step's `notes`
   (commands, results, commit if any). Record each check as exactly one of these:
   - **pass**
   - **fail**
   - **unavailable**: the tool or service isn't there.
   - **blocked**: it needs something only the user can provide.

   Never report "should work" as a pass. If a check fails, fix the code. Don't move on with
   a failing check, and don't weaken the check to make it pass. Once every check passes,
   stop: no extra polish or tests beyond the step.
5. Review your own diff against the checklist at the end of `code-quality.md`, and fix what
   it finds.
6. Set the step to `done`. Report it to the user in a few lines: what changed, the check
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
- a threat mitigation
- a step's estimate by more than half

Bring the evidence, the options and your recommendation, as in planning. Record the outcome
in `changelog` with `by: "user"`, update the affected sections, and continue. If the right
fix is a bigger re-plan, say so. Don't route around the problem with a workaround.

## Finish

When every step is done, check each `testing.acceptance` criterion and each threat
mitigation against the built code, and record the results in the last step's notes. Set
`meta.status` to `done` and add a changelog entry. Then give the user a short summary:
what was built, anything that differed from the plan and who decided it, what was never
verified (with each check's final status), and anything left for them to do (deploys,
keys, manual checks).
