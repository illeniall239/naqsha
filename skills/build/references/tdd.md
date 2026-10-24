# Test-driven by default

No production code without a failing test that asked for it. You write the test, run it,
watch it fail for the reason you expect, then write the least code that makes it pass.
Why: a test you never saw fail has never been shown able to catch anything. Tests written
after the code tend to restate what the code does instead of what it should do, and an AI
writing both halves is especially prone to that. Test-first makes the test the
specification and the code its answer.

This builds on Kent Beck's red-green-refactor, Matt Pocock's `tdd` skill (seams, vertical
slices, the anti-patterns) and superpowers' `test-driven-development` (watch it fail,
delete code written first). It adds outside-in acceptance tests, tests for attacks before
their defenses, characterization of untested code, property, contract and mutation checks,
determinism rules, and a record of each red run.

## The loop

Each step starts from the tests the plan lists for it (`steps[].tests`).

1. **Outside first.** If the step delivers an acceptance criterion or a threat
   mitigation, write that test first, at the outermost seam it can be checked at: an HTTP
   request, a CLI run, a public function. It stays red while the inner loop runs.
2. **Red.** Write one test for one behavior. Run it. It must *fail*, not error, and fail
   with the message you predicted. Before running it, say what production change would make
   it pass. A test that passes at once is testing behavior that already exists, or is
   wrong; a test that errors (typo, bad import) hasn't tested anything yet.
3. **Green.** Write the least code that makes it pass: no options, branches or cases no
   test asks for. Run that test, then the tests of the module.
4. **Refactor, on green only.** Clean up names and duplication and fix the module shape
   (`modularity.md`) with every test passing before and after. Behavior doesn't change
   here; a new behavior is a new red test.
5. **Repeat** with the next behavior, letting what the last cycle taught you pick it. One
   test at a time, never a batch of tests up front (they end up testing the shape you
   imagined, not the behavior you need).
6. **Close.** The outer test from 1 passes. Run the project's whole suite: a green file is
   not a green suite.

**Code written before its test gets deleted,** not kept as a reference and not adapted.
Write the test, watch it fail, and write the code again. Keeping it means you're testing
after, whatever the order looks like.

## Where tests go

- **At the seams the plan agreed.** The plan's `testing.seams` names them, each with what
  it catches and what it misses, and the user approved them with the plan. Testing at a
  different seam is a deviation. Usually a seam is a module's interface (`modularity.md`):
  tests call what callers call.
- **Real collaborators where you can.** Choose by what the dependency is:
  - Pure code in the same process: use it directly.
  - Infrastructure: the same engine and major version as production, run locally (a
    test container, or a local instance). Not a different engine standing in for it:
    SQLite passes tests that Postgres fails, because types, constraints, locking, JSON
    and SQL dialect differ. An in-process build of the same engine (PGlite for Postgres)
    or an in-memory filesystem is fine where it behaves the same for what's tested. Keep
    tests fast by reusing one container per run and isolating each test in a transaction
    or its own schema.
  - Your own service across the network: a fake behind the module's port. Its behavior is
    pinned by contract tests against the real one.
  - A third party you don't control (payments, email, LLM APIs): a fake at the one module
    that owns it, plus a contract test that checks recorded responses against the
    provider's published schema.
  
  Mock nothing else. Never mock the module under test or its internals.

## What makes a test worth keeping

- **Behavior through the interface.** It survives a rewrite of the internals. If a
  refactor breaks it while behavior stays the same, it was coupled to the implementation.
- **An independent expected value.** A literal, a worked example, the spec. Never
  recomputed the way the code computes it, or the test passes by construction.
- **One behavior, named as a sentence.** "An expired reset token is refused", not
  "test redeem 2". A name with "and" is two tests.
- **Deterministic.** Time comes from an injected clock, randomness from a seeded or
  injected source, and order never depends on hashing or scheduling. No `sleep`: wait for
  the condition.
- **Hermetic.** No real network, no shared accounts, no state left between tests. Each test
  creates the data it needs, ideally through a small factory.
- **Fast enough to run on every cycle.** Slow tests stop being run.

## The kinds of test, and when each is required

| Kind | Required for | Notes |
|------|--------------|-------|
| Example-based, at a module interface | Every behavior | The default. |
| Acceptance | Every `testing.acceptance` criterion | Outermost seam, written first. |
| Security (attack first) | Every threat mitigation | Write the attack: another user's id, an oversized body, a `../` path, a forged token, a script tag. Watch it succeed or get through, then build the defense (`secure-coding.md`). |
| Regression | Every bug fix | Reproduces the bug and fails before the fix. |
| Characterization | Changing code that has no tests | Pin what the code does today before touching it (Michael Feathers). Refactors keep these green. |
| Property-based | Parsers, serializers, money, sorting, anything with an invariant | fast-check, Hypothesis, proptest, jqwik: "decode(encode(x)) == x", "total never negative". |
| Contract | Every outside system behind a fake | Keeps the fake honest. |

## Test the tests

- A test that passed the first time it ran proves nothing yet. Break the code it covers
  on purpose (flip a condition, drop a check) and watch it fail, then put the code back.
  Do this for every characterization test and for any test whose red you didn't see.
- For risky logic (money, auth, parsing, data writes), run a mutation tool on the changed
  module if the project has one (Stryker, mutmut, PIT, cargo-mutants). A surviving mutant
  is a missing test.
- Coverage is a map of what you haven't tested, not a target. Never write a test just to
  move the number.

## Record the evidence

In the step's `notes`, for each test: the red run (command and the failing assertion
line), then the green run. At the end of the step, the whole suite's result. "Watched it
fail" with nothing pasted is a claim, not evidence.

## Never

- Edit, delete, skip (`.skip`, `xit`, `@pytest.mark.skip`, `t.Skip`) or loosen a test to get
  to green. A failing test means fix the code, or ask the user if you think the test is
  wrong.
- Re-record snapshots or fixtures without reading what changed.
- Catch an exception inside a test to make it pass, or assert only that a mock was called.
- Put test-only branches, flags or hooks in production code.
- Test private internals, or check results through a side door (the database) when the
  interface can show them.

## When test-first doesn't fit

Some work has no behavior a test can state first: formatter or CI config, generated code,
a pure visual change, documentation, or throwaway exploration. That is decided in the plan,
never mid-build: the step's `tests` is `{ "na": "<why>" }` and its `doneWhen` names the
check that replaces it (the CI run, a screenshot compared by the user, the generator's own
tests). Exploration happens in the scratchpad and is thrown away; what it taught you comes
back through a red test.

If the project has no test runner, setting one up is the plan's first step, and the tool is a
decision for the user.

## When you're tempted

| Thought | Answer |
|---------|--------|
| "Too simple to test" | Simple code breaks too, and the test takes a minute. |
| "I'll add tests after" | Then you're checking what you wrote, not what was asked. |
| "Hard to test" | The design is telling you something: pass the dependency in, or move the I/O to the edge. |
| "The test is wrong" | Maybe. Ask the user; don't change it on your own. |
| "I already ran it by hand" | Hand runs aren't repeatable and leave no record. |
| "It's only a refactor" | Then the characterization tests prove it. |
