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
- **Tests first, and tests that test.** Every behavior starts as a test you watched fail
  (`tdd.md`). Assert behavior, not implementation details. Never edit a test, mock the unit
  under test, or loosen an assertion to make it pass. That hides the bug from the user. A
  failing test means fix the code, or ask if the test is wrong.
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

## Secure and modular

Three standards come before everything in this file, and each has its own reference: read
`secure-coding.md`, `tdd.md` and `modularity.md` with this one. Security has no exceptions
you can make yourself. No production code is written before a failing test asks for it.
Every piece of new code goes into a module with one job and a small interface.

## Nothing extra

- No abstraction, option, config flag, wrapper or "for later" hook that the plan doesn't
  call for. Modules the plan's architecture names are called for; layers that only pass
  calls through are not (see the deletion test in `modularity.md`). Inside a module, three
  similar lines are cheaper than the wrong generalization.
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

1. **Secure.** Walk every rule in `secure-coding.md` that the diff touches, grep it for the
   red flags listed there, and confirm each threat mitigation this step owns is built and
   has a test that fails without it. Data loss counts too: swallowed errors, writes in the
   wrong order, no transaction.
2. **Correct.** Wrong results, crashes, missed edge cases (empty, zero, last item, rounding,
   time zones). If you changed a function's signature, return value or behavior, grep every
   caller and check each one still works. Fix the shared code once rather than patching one
   caller.
3. **Modular.** Answer the review questions in `modularity.md` for every module you added or
   changed.
4. **Contracts and operations.** Answer the review questions in `data-and-apis.md`,
   `operability.md` and `docs-and-setup.md` for whatever the diff touches.
5. **Holds under real load.** Judge against the plan's estimates and quality scenarios,
   with `performance.md`: on a hot path, its complexity in queries, round trips, memory and
   CPU at the estimated size, and the benchmark that proves the budget; anywhere, the
   traps that grow quietly, worst-case behavior on untrusted input, check-then-write
   races, and per-process state that has to be shared.
6. **Test-first.** Every behavior in the diff has a test whose red run is in the notes, at
   a seam the plan agreed, with the kinds `tdd.md` requires (attack tests for mitigations,
   a regression test for a bug, characterization before a refactor, properties for
   invariants). Tests are deterministic and hermetic. Coverage numbers are not the goal.
7. **Fast enough.** Big slowdowns are bugs. Leave micro-optimizations alone unless the plan
   says this path is hot.
8. **Lean.** Look for dead code, a helper the repo already has, something the standard
   library already does, an abstraction with one implementation, or near-copies that must
   change together.

Your own review comes first; then a fresh reviewer checks the step again
(`independent-review.md`), because you can't see your own blind spots.

Every problem you find needs a concrete case: this input or situation leads to this wrong
result. Without a case it's a hunch. Check it, don't act on it. Fix what you find before you
show the step to the user.
