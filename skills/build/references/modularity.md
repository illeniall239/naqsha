# Modular by default

Every piece of code you write belongs to a module with one job, a small interface, and
decisions it keeps to itself. That's the default for new code in any codebase, at every
size: a function, a file, a package, a service. Why: a change, a bug, or a security fix then
lands in one place instead of spreading across every caller. That's what lets a person, or
the next AI session, change the code safely without reading all of it.

The ideas come from Parnas's information hiding ("On the Criteria To Be Used in Decomposing
Systems into Modules", 1972) and Ousterhout's deep modules (*A Philosophy of Software
Design*). The vocabulary follows Matt Pocock's `codebase-design` skill.

## What a module is

- **One responsibility.** It has one reason to change. Describe it in one sentence without
  "and".
- **A small interface.** Everything a caller has to know: the functions it exports, their
  types, the errors they raise, their invariants. Export only what callers use; keep the
  rest private using the language's own tools (unexported names, `_private`, `internal/`,
  package-private, files that aren't entry points).
- **Hides a decision.** A data format, a storage engine, a third-party API, an algorithm. If
  that decision changes, only this module changes.
- **Testable through its interface.** Tests call what callers call. A test that has to reach
  past the interface means the module is the wrong shape.

## Defaults

1. **Split by responsibility, not only by layer.** Files that change together live together.
   A feature's validation, logic and storage sit near each other; a `utils/` folder of
   unrelated helpers is not a module.
2. **I/O at the edges, logic in the middle.** A handler, CLI command or job parses and
   validates input, calls the logic, and formats the result. The logic takes values and
   returns values. Pass its dependencies in rather than constructing them inside, so it can
   be tested without a network or a database.
3. **Each outside system has one owner.** One module imports the database client, the
   payment SDK, the email provider or the HTTP client for a given service. Timeouts, retries,
   credentials and error mapping live there once.
4. **Security controls live in one place.** Input schemas sit at the boundary module.
   Authorization is one policy module every entry point calls. Secrets and configuration
   are read in one config module, and crypto goes through one wrapper. Why: a check that
   lives in one place can't be forgotten in the next handler (see `secure-coding.md`).
5. **Dependencies point one way.** Edges depend on the logic, not the reverse: domain code
   never imports the web framework. No cycles. If the project checks boundaries
   (dependency-cruiser, eslint-plugin-boundaries, import-linter, Go `internal/`, ArchUnit),
   keep it passing.
6. **Return, don't mutate.** Functions return new values instead of changing their
   arguments or shared state. Module-level mutable state is a hidden interface; avoid it.
7. **Size is a signal, not a rule.** A function past ~40 lines, or a file past ~300, or one
   that needs "and" to describe, is a prompt to check for two responsibilities. Split by
   responsibility, never by line count alone.

## What modular is not

Modular doesn't mean more layers. Each of these adds interface without adding depth:

- **A pass-through.** A wrapper, service or manager that only forwards calls. Apply the
  deletion test: if deleting the module would make complexity vanish, it was a pass-through;
  if complexity would reappear in every caller, it earns its place.
- **A seam with one side.** An interface, factory or port with a single implementation.
  One adapter is a hypothetical seam; two (say production and a test fake) make a real one.
- **Speculative generality.** Options, plugins or extension points nothing uses yet.

The plan's architecture names the modules. Build those; don't invent others along the way.

## In an existing codebase

- Follow the module structure that's already there. New code goes into the module whose
  responsibility it is, in that module's style.
- If the step needs a file that already mixes responsibilities, don't add a third one
  silently. If the plan has an extraction step, do it first, as its own refactor step with
  checks that pass before and after. If it doesn't, bring it to the user as a deviation,
  with the smallest extraction that would give the new code a proper home.
- Don't restructure code the step doesn't touch.

## Review

For each module the step adds or changes, answer:

- Its responsibility, in one sentence without "and".
- Its interface: what's exported, and does any caller use something it shouldn't need?
- What it hides: name the decision that would change only this file.
- Its dependencies: do they point inward, and are there no cycles?
- Its tests: do they go through the interface?
