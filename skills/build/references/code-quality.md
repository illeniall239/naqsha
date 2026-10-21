# Code quality: what "no slop" means

The user decides what gets built. You write it, and it should read like the work of a
strong engineer who knows this codebase and this stack: idiomatic, minimal, correct, and
verified. Slop is code that looks plausible but that such an engineer wouldn't write. Each
item below is a form of it, with the reason it costs the user.

## Correctness you can't fake

- **APIs from the source, not from memory.** Check every library call against the
  installed version: its type definitions, its docs for that version, or a quick check in
  the scratchpad. Hallucinated options and methods from other versions are the most common
  AI bug.
- **No placeholders.** No "simplified for brevity", `// TODO: implement`, stub returns,
  fake data or hardcoded happy paths. If something can't be finished, the step isn't done.
  Say so.
- **Errors are handled where something can be done about them,** and passed on otherwise.
  No `catch {}`, no catching just to log and continue, no `catch (e) { throw e }`. A
  swallowed error means a silent data bug later.
- **Tests that test.** Assert behavior, not implementation details. Never edit a test, mock
  the unit under test, or loosen an assertion to make it pass. That hides the bug from the
  user. A failing test means fix the code, or ask if the test is wrong.
- **Edge cases from the plan and the prior art:** empty input, duplicates, concurrency,
  time zones, Unicode, limits, partial failure. Handle them, or say in the step notes why
  they can't occur.

## Fits the codebase

- Match the surrounding code: naming, file layout, error style, module boundaries, how
  similar things are already done. A newcomer shouldn't be able to tell which code is yours.
- Reuse what exists. A second helper that does what an existing one does is debt.
- Follow the stack's own idioms and official style guidance. Write Go that reads like Go,
  and React that follows React's rules.
- The project's formatter, linter and type checker are the floor. Run them and fix what they
  report. Don't silence a rule with `eslint-disable`, `# type: ignore`, `any` or `!`.
  Fix the cause, or ask.

## Nothing extra

- No abstraction, option, config flag, wrapper or "for later" hook that the plan doesn't
  call for. Three similar lines are cheaper than the wrong abstraction.
- No dead code, commented-out code, unused imports or parameters, or debug output left
  behind.
- Comments explain *why*, when the code can't. Never narrate what the next line does, and
  don't leave changelog-style comments ("updated to use X"); that's what git is for.
- Names say what a thing is in this domain. Avoid `data`, `result`, `handleStuff`,
  `utils2` and `NewImprovedService`.
- Functions do one thing at one level of abstraction. Split a function when it does two
  things, not just when it's long.

## Before you call a step done

Review your diff as the engineer who gets paged when it breaks. Read the code it touches as
well, not only the diff. Go in this order, because an earlier problem outweighs any later
one:

1. **Correct.** Wrong results, crashes, missed edge cases (empty, zero, last item, rounding,
   time zones). If you changed a function's signature, return value or behavior, grep every
   caller and check each one still works. Fix the shared code once rather than patching one
   caller.
2. **Safe.** Input from users checked at the boundary, injection, weak randomness, secrets
   in code or logs, missing auth checks, data loss (swallowed errors, writes in the wrong
   order, no transaction). Include the threat mitigations this step owns.
3. **Holds under real load.** Judge against the load in the plan's non-functional
   requirements. Look for check-then-write races, a query per item, lists or caches that
   only grow, O(n²) on real input, and per-process state that has to be shared.
4. **Tested.** Every risky piece of new logic (a branch, a parser, money, security, a data
   write, a bug fix) has a test that fails when it breaks. Aim for one good test, not
   coverage numbers.
5. **Fast enough.** Big slowdowns are bugs. Leave micro-optimizations alone unless the plan
   says this path is hot.
6. **Lean.** Look for dead code, a helper the repo already has, something the standard
   library already does, an abstraction with one implementation, or near-copies that must
   change together.

Every problem you find needs a concrete case: this input or situation leads to this wrong
result. Without a case it's a hunch. Check it, don't act on it. Fix what you find before you
show the step to the user.
